import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import * as os from 'os';

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerService.name);
  private workerId!: string;
  private isRunning = false;
  private isPolling = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private readonly concurrencyCapacity = 10;
  private currentLoad = 0;

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    this.logger.log('Worker initializing...');
    try {
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
    } catch (err) {
      this.logger.error('Failed to register worker in database during initialization', err);
      throw err;
    }
  }

  async onModuleDestroy() {
    this.isRunning = false;
    if (this.pollInterval) clearInterval(this.pollInterval);

    // Graceful shutdown: wait for active jobs to complete (max 30 seconds)
    const shutdownTimeout = 30000;
    const startTime = Date.now();
    while (this.currentLoad > 0 && Date.now() - startTime < shutdownTimeout) {
      this.logger.log(`Graceful shutdown: waiting for ${this.currentLoad} active jobs to finish...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    try {
      await this.prisma.worker.update({
        where: { id: this.workerId },
        data: { status: 'offline', current_load: 0 },
      });
    } catch (err) {
      this.logger.error('Error marking worker offline during shutdown', err);
    }
    this.logger.log('Worker shutdown gracefully');
  }

  private startHeartbeat() {
    setInterval(async () => {
      if (!this.isRunning) return;
      try {
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
      } catch (err) {
        this.logger.error('Failed to send worker heartbeat', err);
      }
    }, 10000);
  }

  private async poll() {
    if (!this.isRunning || this.currentLoad >= this.concurrencyCapacity || this.isPolling) return;
    
    this.isPolling = true;
    try {
      // Get active queues
      const queues = await this.prisma.queue.findMany({ where: { is_paused: false } });
      
      for (const queue of queues) {
        if (!this.isRunning || this.currentLoad >= this.concurrencyCapacity) break;
        await this.processQueue(queue.id);
      }
    } catch (err) {
      this.logger.error('Error during queue polling cycle:', err);
    } finally {
      this.isPolling = false;
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
        this.executeJob(job)
          .catch((err) => this.logger.error(`Unhandled execution rejection for job ${job.id}`, err))
          .finally(() => {
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
    let executionId: bigint | null = null;
    
    try {
      // 1. Create execution record and update job status
      const execution = await this.prisma.jobExecution.create({
        data: {
          job_id: job.id,
          worker_id: this.workerId,
          attempt_number: job.attempt_count,
          status: 'running',
          started_at: startTime,
        },
      });
      executionId = execution.id;

      await this.prisma.job.update({ 
        where: { id: job.id }, 
        data: { status: 'running', started_at: startTime } 
      });

      // 2. Run the handler
      await this.runHandler(job);

      // 3. Mark completed under ownership validation
      const endTime = new Date();
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.job.updateMany({
          where: { id: job.id, claimed_by_worker_id: this.workerId, status: 'running' },
          data: { status: 'completed', completed_at: endTime }
        });
        
        if (updated.count === 0) {
          throw new Error('Lost ownership of job');
        }

        await tx.jobExecution.update({
          where: { id: executionId! },
          data: { status: 'completed', finished_at: endTime, duration_ms: endTime.getTime() - startTime.getTime() },
        });

        await tx.$executeRaw`
          UPDATE queues 
          SET current_running = GREATEST(0, current_running - 1) 
          WHERE id = ${job.queue_id}::uuid;
        `;
      });
      
      this.logger.log(`Job ${job.id} completed successfully`);
    } catch (error: any) {
      this.logger.error(`Job ${job.id} failed`, error);
      if (executionId) {
        await this.handleJobFailure(job, executionId, startTime, error);
      } else {
        // Safe rollback/requeue if creation/update failed before execution started
        try {
          await this.prisma.$transaction([
            this.prisma.job.update({
              where: { id: job.id },
              data: { status: 'queued', claimed_by_worker_id: null, attempt_count: Math.max(0, job.attempt_count - 1) }
            }),
            this.prisma.$executeRaw`
              UPDATE queues 
              SET current_running = GREATEST(0, current_running - 1) 
              WHERE id = ${job.queue_id}::uuid;
            `
          ]);
        } catch (releaseErr) {
          this.logger.error(`Failed to release claimed slot for unstarted job ${job.id}`, releaseErr);
        }
      }
    }
  }

  private async runHandler(job: any) {
    if (job.type === 'fail') {
      throw new Error('Simulated job failure');
    }
    return new Promise(resolve => setTimeout(resolve, 500));
  }

  private async handleJobFailure(job: any, executionId: bigint, startTime: Date, error: Error) {
    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    // Guard against stale updates if ownership was lost (e.g. orphan detection occurred)
    if (error.message === 'Lost ownership of job') {
      this.logger.warn(`Job ${job.id} lost ownership. Skipping status update, only updating execution log.`);
      try {
        await this.prisma.jobExecution.update({
          where: { id: executionId },
          data: { status: 'failed', finished_at: endTime, duration_ms: duration, error_message: error.message }
        });
      } catch (e) {
        this.logger.error(`Failed to update execution log for lost job ${job.id}`, e);
      }
      return;
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        // Enforce ownership validation when writing failure state
        const updated = await tx.job.updateMany({
          where: { id: job.id, claimed_by_worker_id: this.workerId, status: 'running' },
          data: job.attempt_count >= job.max_attempts
            ? { status: 'dead-letter', claimed_by_worker_id: null }
            : { status: 'scheduled', run_at: new Date(Date.now() + 5000), claimed_by_worker_id: null }
        });

        if (updated.count === 0) {
          throw new Error('Lost ownership of job');
        }

        if (job.attempt_count >= job.max_attempts) {
          await tx.deadLetterQueue.create({
            data: {
              job_id: job.id,
              queue_id: job.queue_id,
              payload_snapshot: job.payload,
              failure_reason: error.message,
              attempt_count: job.attempt_count,
            }
          });
        }

        await tx.jobExecution.update({
          where: { id: executionId },
          data: { status: 'failed', finished_at: endTime, duration_ms: duration, error_message: error.message },
        });

        await tx.$executeRaw`
          UPDATE queues 
          SET current_running = GREATEST(0, current_running - 1) 
          WHERE id = ${job.queue_id}::uuid;
        `;
      });
    } catch (txErr: any) {
      this.logger.error(`Failed to handle failure updates for job ${job.id}`, txErr);
    }
  }
}
