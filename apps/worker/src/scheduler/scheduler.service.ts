import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import Redis from 'ioredis';
const cronParser = require('cron-parser');

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private redis!: Redis;
  private isLeader = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private leaderKey = 'scheduler:leader';
  private leaderInstanceId = Math.random().toString(36).substring(7);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    this.isRunning = true;
    
    // Attempt leader election every 10 seconds
    setInterval(() => this.tryAcquireLeader(), 10000);
    this.tryAcquireLeader();

    // Materialize jobs every 15 seconds
    this.pollInterval = setInterval(() => this.materializeJobs(), 15000);
  }

  async onModuleDestroy() {
    this.isRunning = false;
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.isLeader) {
      await this.redis.del(this.leaderKey);
    }
    await this.redis.quit();
  }

  private async tryAcquireLeader() {
    if (!this.isRunning) return;
    try {
      const acquired = await this.redis.set(this.leaderKey, this.leaderInstanceId, 'EX', 15, 'NX');
      if (acquired === 'OK') {
        if (!this.isLeader) {
          this.logger.log(`Acquired leader role (${this.leaderInstanceId})`);
        }
        this.isLeader = true;
      } else {
        const currentLeader = await this.redis.get(this.leaderKey);
        if (currentLeader === this.leaderInstanceId) {
          // Renew lease
          await this.redis.expire(this.leaderKey, 15);
          this.isLeader = true;
        } else {
          if (this.isLeader) {
            this.logger.log(`Lost leader role to ${currentLeader}`);
          }
          this.isLeader = false;
        }
      }
    } catch (e) {
      this.logger.error('Error during leader election', e);
      this.isLeader = false;
    }
  }

  private async materializeJobs() {
    if (!this.isRunning || !this.isLeader) return;
    try {
      const now = new Date();
      await this.prisma.$transaction(async (tx) => {
        const dueJobs = await tx.$queryRaw<any[]>`
          SELECT * FROM scheduled_jobs 
          WHERE next_run_at <= ${now} 
          FOR UPDATE SKIP LOCKED;
        `;
        if (dueJobs.length === 0) return;
        for (const sJob of dueJobs) {
          this.logger.log(`Materializing scheduled job ${sJob.id}`);
          await tx.job.create({
            data: {
              queue_id: sJob.queue_id,
              type: sJob.job_template.type || 'default',
              payload: sJob.job_template.payload || {},
              priority: sJob.job_template.priority || 0,
              status: 'queued',
              run_at: now,
              max_attempts: sJob.job_template.max_attempts || 3,
            }
          });
          try {
            const interval = cronParser.parseExpression(sJob.cron_expression, { tz: sJob.timezone, currentDate: now });
            const nextRun = interval.next().toDate();
            await tx.scheduledJob.update({
              where: { id: sJob.id },
              data: { next_run_at: nextRun, last_run_at: now }
            });
          } catch (cronErr: any) {
            await tx.scheduledJob.update({
              where: { id: sJob.id },
              data: { next_run_at: new Date('9999-12-31T23:59:59Z') }
            });
          }
        }
      });
      await this.detectOrphans();
    } catch (e) {
      this.logger.error('Error materializing scheduled jobs', e);
    }
  }

  private async detectOrphans() {
    // Find workers that haven't heartbeated in 30 seconds
    const threshold = new Date(Date.now() - 30000);
    const deadWorkers = await this.prisma.worker.findMany({
      where: {
        status: 'active',
        last_heartbeat_at: { lt: threshold }
      }
    });

    for (const worker of deadWorkers) {
      this.logger.log(`Worker ${worker.id} marked offline (orphan detection)`);
      await this.prisma.$transaction(async (tx) => {
        // Mark worker offline
        await tx.worker.update({
          where: { id: worker.id },
          data: { status: 'offline', current_load: 0 }
        });
        
        // Requeue jobs claimed by this worker
        const jobs = await tx.job.findMany({
          where: { claimed_by_worker_id: worker.id, status: 'running' }
        });

        for (const job of jobs) {
          await tx.job.update({
            where: { id: job.id },
            data: { status: 'queued', claimed_by_worker_id: null, attempt_count: Math.max(0, job.attempt_count - 1) }
          });
          
          await tx.$executeRaw`UPDATE queues SET current_running = GREATEST(0, current_running - 1) WHERE id = ${job.queue_id}::uuid;`;
        }
      });
    }
  }
}
