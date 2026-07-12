import { Test, TestingModule } from '@nestjs/testing';
import { JobsService } from './jobs.service';
import { PrismaService } from '../database/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('JobsService', () => {
  let service: JobsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    queue: {
      findFirst: jest.fn(),
    },
    job: {
      create: jest.fn(),
    },
    scheduledJob: {
      create: jest.fn(),
    },
    batch: {
      create: jest.fn(),
    },
    $transaction: jest.fn((promises) => Promise.all(promises)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  describe('createScheduledJob', () => {
    it('should successfully create a scheduled job with valid cron and timezone', async () => {
      mockPrismaService.queue.findFirst.mockResolvedValue({ id: 'queue-1' });
      mockPrismaService.scheduledJob.create.mockResolvedValue({
        id: 'sched-1',
      });

      const result = await service.createScheduledJob('queue-1', 'org-1', {
        cron_expression: '* * * * *',
        job_template: { type: 'test' },
        timezone: 'America/New_York',
      });

      expect(mockPrismaService.queue.findFirst).toHaveBeenCalledWith({
        where: { id: 'queue-1', project: { org_id: 'org-1' } },
      });
      expect(mockPrismaService.scheduledJob.create).toHaveBeenCalled();
      expect(result).toEqual({ id: 'sched-1' });
    });

    it('should throw BadRequestException for invalid cron expression', async () => {
      mockPrismaService.queue.findFirst.mockResolvedValue({ id: 'queue-1' });

      await expect(
        service.createScheduledJob('queue-1', 'org-1', {
          cron_expression: 'invalid-cron',
          job_template: { type: 'test' },
          timezone: 'UTC',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid timezone', async () => {
      mockPrismaService.queue.findFirst.mockResolvedValue({ id: 'queue-1' });

      await expect(
        service.createScheduledJob('queue-1', 'org-1', {
          cron_expression: '* * * * *',
          job_template: { type: 'test' },
          timezone: 'Invalid/Timezone',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if queue does not exist', async () => {
      mockPrismaService.queue.findFirst.mockResolvedValue(null);

      await expect(
        service.createScheduledJob('queue-1', 'org-1', {
          cron_expression: '* * * * *',
          job_template: { type: 'test' },
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createBatch', () => {
    it('should map idempotency_key when creating jobs inside batch', async () => {
      mockPrismaService.queue.findFirst.mockResolvedValue({ id: 'queue-1' });
      mockPrismaService.batch.create.mockResolvedValue({
        id: 'batch-1',
        name: 'Batch 1',
        total_jobs: 2,
      });
      mockPrismaService.job.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'job-mock', ...data }),
      );

      const dtos = [
        { type: 'test-1', payload: { x: 1 }, idempotency_key: 'key-1' },
        { type: 'test-2', payload: { x: 2 }, idempotency_key: 'key-2' },
      ];

      const result = await service.createBatch('queue-1', 'org-1', dtos);

      expect(mockPrismaService.batch.create).toHaveBeenCalled();
      expect(mockPrismaService.job.create).toHaveBeenCalledTimes(2);
      expect(mockPrismaService.job.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: expect.objectContaining({
            idempotency_key: 'key-1',
          }),
        }),
      );
      expect(mockPrismaService.job.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          data: expect.objectContaining({
            idempotency_key: 'key-2',
          }),
        }),
      );
      expect(result.jobs[0].idempotency_key).toBe('key-1');
      expect(result.jobs[1].idempotency_key).toBe('key-2');
    });
  });
});
