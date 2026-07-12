import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import * as os from 'os';

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerService.name);
  private workerId!: string;
  private isRunning = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private readonly concurrencyCapacity = 10;
  private currentLoad = 0;

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    this.logger.log('Worker initializing...');
    const worker = await this.prisma.worker.create({
      data: {
        hostname: os.hostname(),
        pid: process.pid,
        status: 'active',
        concurrency_capacity: this.concurrencyCapacity,
        current_load: 0,
      },
    });
    this.workerId = worker.id;
    this.logger.log(`Worker registered with ID ${this.workerId}`);
    
    this.isRunning = true;
    this.pollInterval = setInterval(() => this.poll(), 5000); // 5 seconds
    this.startHeartbeat();
  }

  async onModuleDestroy() {
    this.isRunning = false;
    if (this.pollInterval) clearInterval(this.pollInterval);
    await this.prisma.worker.update({
      where: { id: this.workerId },
      data: { status: 'offline' },
    });
    this.logger.log('Worker shutdown gracefully');
  }

  private startHeartbeat() {
    setInterval(async () => {
      if (!this.isRunning) return;
      await this.prisma.worker.update({
        where: { id: this.workerId },
        data: { 
          last_heartbeat_at: new Date(),
          current_load: this.currentLoad,
        },
      });
      await this.prisma.workerHeartbeat.create({
        data: {
          worker_id: this.workerId,
          active_job_count: this.currentLoad,
        }
      });
    }, 10000);
  }

  private async poll() {
    if (!this.isRunning || this.currentLoad >= this.concurrencyCapacity) return;

    // Get active queues
    const queues = await this.prisma.queue.findMany({ where: { is_paused: false } });
    
    for (const queue of queues) {
      if (!this.isRunning || this.currentLoad >= this.concurrencyCapacity) break;
      await this.processQueue(queue.id);
    }
  }

  private async processQueue(queueId: string) {
    try {
      const claimedJobs = await this.prisma.$transaction(async (tx) => {
        const queues = await tx.$queryRaw<any[]>`
          SELECT concurrency_limit, current_running FROM queues WHERE id = ${queueId}::uuid FOR UPDATE;
        `;
        if (queues.length === 0) return [];
        const queue = queues[0];
        
        const workerCapacity = this.concurrencyCapacity - this.currentLoad;
        const queueCapacity = queue.concurrency_limit - queue.current_running;
        const capacity = Math.min(workerCapacity, queueCapacity);
        
        if (capacity <= 0) return [];

        const claimed = await tx.$queryRaw<any[]>`
          UPDATE jobs
          SET status = 'claimed',
              claimed_by_worker_id = ${this.workerId}::uuid,
              claimed_at = now(),
              attempt_count = attempt_count + 1
          WHERE id IN (
            SELECT id FROM jobs
            WHERE queue_id = ${queueId}::uuid
              AND status IN ('queued', 'scheduled')
              AND run_at <= now()
            ORDER BY priority DESC, run_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT ${capacity}
          )
          RETURNING *;
        `;

        if (claimed.length > 0) {
          await tx.$executeRaw`
            UPDATE queues SET current_running = current_running + ${claimed.length} WHERE id = ${queueId}::uuid;
          `;
        }
        
        return claimed;
      });

      for (const job of claimedJobs) {
        this.currentLoad++;
        this.executeJob(job).finally(() => {
          this.currentLoad--;
        });
      }
    } catch (e) {
      this.logger.error(`Error polling queue ${queueId}:`, e);
    }
  }

  private async executeJob(job: any) {
    this.logger.log(`Executing job ${job.id}`);
    const startTime = new Date();
    
    const execution = await this.prisma.jobExecution.create({
      data: {
        job_id: job.id,
        worker_id: this.workerId,
        attempt_number: job.attempt_count,
        status: 'running',
        started_at: startTime,
      },
    });

    await this.prisma.job.update({ where: { id: job.id }, data: { status: 'running', started_at: startTime } });

    try {
      // Simulate handler based on job type
      await this.runHandler(job);

      const endTime = new Date();
      await this.prisma.$transaction([
        this.prisma.job.update({ where: { id: job.id }, data: { status: 'completed', completed_at: endTime } }),
        this.prisma.jobExecution.update({
          where: { id: execution.id },
          data: { status: 'completed', finished_at: endTime, duration_ms: endTime.getTime() - startTime.getTime() },
        }),
        this.prisma.$executeRaw`UPDATE queues SET current_running = current_running - 1 WHERE id = ${job.queue_id}::uuid;`
      ]);
      
      this.logger.log(`Job ${job.id} completed successfully`);
    } catch (error: any) {
      this.logger.error(`Job ${job.id} failed`, error);
      await this.handleJobFailure(job, execution.id, startTime, error);
    }
  }

  private async runHandler(job: any) {
    // Dummy handler logic
    if (job.type === 'fail') {
      throw new Error('Simulated job failure');
    }
    return new Promise(resolve => setTimeout(resolve, 500));
  }

  private async handleJobFailure(job: any, executionId: bigint, startTime: Date, error: Error) {
    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    // Check retry budget
    if (job.attempt_count >= job.max_attempts) {
      // Move to DLQ
      await this.prisma.$transaction([
        this.prisma.job.update({ where: { id: job.id }, data: { status: 'dead-letter' } }),
        this.prisma.deadLetterQueue.create({
          data: {
            job_id: job.id,
            queue_id: job.queue_id,
            payload_snapshot: job.payload,
            failure_reason: error.message,
            attempt_count: job.attempt_count,
          }
        }),
        this.prisma.jobExecution.update({
          where: { id: executionId },
          data: { status: 'failed', finished_at: endTime, duration_ms: duration, error_message: error.message },
        }),
        this.prisma.$executeRaw`UPDATE queues SET current_running = current_running - 1 WHERE id = ${job.queue_id}::uuid;`
      ]);
    } else {
      // Reschedule (Fixed backoff for now)
      const nextRunAt = new Date(Date.now() + 5000); // 5s backoff
      await this.prisma.$transaction([
        this.prisma.job.update({ where: { id: job.id }, data: { status: 'scheduled', run_at: nextRunAt } }),
        this.prisma.jobExecution.update({
          where: { id: executionId },
          data: { status: 'failed', finished_at: endTime, duration_ms: duration, error_message: error.message },
        }),
        this.prisma.$executeRaw`UPDATE queues SET current_running = current_running - 1 WHERE id = ${job.queue_id}::uuid;`
      ]);
    }
  }
}
