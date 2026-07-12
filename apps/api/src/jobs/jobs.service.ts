import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateJobDto } from './dto/create-job.dto';
import * as cronParser from 'cron-parser';
import { CreateScheduledJobDto } from './dto/create-scheduled-job.dto';

@Injectable()
export class JobsService {
  constructor(private prisma: PrismaService) {}

  async createJob(queueId: string, orgId: string, dto: CreateJobDto) {
    const queue = await this.prisma.queue.findFirst({
      where: { id: queueId, project: { org_id: orgId } },
    });
    if (!queue) throw new NotFoundException('Queue not found');

    const status = dto.run_at ? 'scheduled' : 'queued';
    const runAt = dto.run_at ? new Date(dto.run_at) : new Date();

    if (dto.idempotency_key) {
      const existing = await this.prisma.job.findUnique({
        where: {
          queue_id_idempotency_key: {
            queue_id: queueId,
            idempotency_key: dto.idempotency_key,
          },
        },
      });
      if (existing) return existing;
    }

    try {
      return await this.prisma.job.create({
        data: {
          queue_id: queueId,
          type: dto.type,
          payload: dto.payload,
          priority: dto.priority || 0,
          status,
          run_at: runAt,
          idempotency_key: dto.idempotency_key,
          batch_id: dto.batch_id,
          max_attempts: 3, // Default, can be overridden by queue policy later
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002' && dto.idempotency_key) {
        const existing = await this.prisma.job.findUnique({
          where: {
            queue_id_idempotency_key: {
              queue_id: queueId,
              idempotency_key: dto.idempotency_key,
            },
          },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  async createBatch(queueId: string, orgId: string, dtos: CreateJobDto[]) {
    const queue = await this.prisma.queue.findFirst({
      where: { id: queueId, project: { org_id: orgId } },
    });
    if (!queue) throw new NotFoundException('Queue not found');

    const batch = await this.prisma.batch.create({
      data: {
        name: `Batch ${new Date().toISOString()}`,
        total_jobs: dtos.length,
        status: 'pending',
      },
    });

    const jobs = await this.prisma.$transaction(
      dtos.map((dto) => {
        const status = dto.run_at ? 'scheduled' : 'queued';
        const runAt = dto.run_at ? new Date(dto.run_at) : new Date();
        return this.prisma.job.create({
          data: {
            queue_id: queueId,
            type: dto.type,
            payload: dto.payload,
            priority: dto.priority || 0,
            status,
            run_at: runAt,
            batch_id: batch.id,
            idempotency_key: dto.idempotency_key,
            max_attempts: 3,
          },
        });
      }),
    );

    return { batch, jobs };
  }

  async createScheduledJob(
    queueId: string,
    orgId: string,
    dto: CreateScheduledJobDto,
  ) {
    const queue = await this.prisma.queue.findFirst({
      where: { id: queueId, project: { org_id: orgId } },
    });
    if (!queue) throw new NotFoundException('Queue not found');

    let nextRunAt: Date;
    try {
      const interval = cronParser.default.parse(dto.cron_expression, {
        tz: dto.timezone || 'UTC',
      });
      nextRunAt = interval.next().toDate();
    } catch (error) {
      throw new BadRequestException('Invalid cron expression or timezone');
    }

    return this.prisma.scheduledJob.create({
      data: {
        queue_id: queueId,
        cron_expression: dto.cron_expression,
        job_template: dto.job_template,
        timezone: dto.timezone || 'UTC',
        next_run_at: nextRunAt,
      },
    });
  }

  async cancelJob(id: string, orgId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id, queue: { project: { org_id: orgId } } },
    });
    if (!job) throw new NotFoundException('Job not found');
    if (job.status !== 'queued' && job.status !== 'scheduled') {
      throw new NotFoundException(
        'Only queued or scheduled jobs can be cancelled',
      );
    }

    return this.prisma.job.update({
      where: { id },
      data: { status: 'cancelled' },
    });
  }

  async findAllJobs(
    queueId: string,
    orgId: string,
    status?: string,
    limit: number = 25,
    cursor?: string,
  ) {
    const args: any = {
      where: { queue_id: queueId, queue: { project: { org_id: orgId } } },
      take: limit,
      orderBy: { id: 'asc' },
    };
    if (status) args.where.status = status;
    if (cursor) {
      args.cursor = { id: cursor };
      args.skip = 1;
    }
    return this.prisma.job.findMany(args);
  }

  async getJob(id: string, orgId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id, queue: { project: { org_id: orgId } } },
      include: { executions: true, logs: true },
    });
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async requeueJob(id: string, orgId: string) {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: { dead_letter_entry: true },
    });

    if (!job) throw new NotFoundException('Job not found');
    if (!job.dead_letter_entry)
      throw new BadRequestException('Job is not in dead letter queue');

    return this.prisma.$transaction([
      this.prisma.job.update({
        where: { id },
        data: { status: 'queued', attempt_count: 0, run_at: new Date() },
      }),
      this.prisma.deadLetterQueue.delete({ where: { job_id: id } }),
    ]);
  }

  async getJobLogs(id: string, orgId: string) {
    await this.getJob(id, orgId); // Verify access
    return this.prisma.jobLog.findMany({
      where: { job_id: id },
      orderBy: { created_at: 'asc' },
    });
  }

  async addJobLog(
    id: string,
    orgId: string,
    message: string,
    level: string = 'info',
  ) {
    const job = await this.getJob(id, orgId);
    return this.prisma.jobLog.create({
      data: {
        job_id: id,
        message,
        level,
        execution_id: job.executions[0]?.id || null,
      },
    });
  }
}
