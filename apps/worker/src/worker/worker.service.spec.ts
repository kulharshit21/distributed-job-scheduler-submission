import { Test, TestingModule } from '@nestjs/testing';
import { WorkerService } from './worker.service';
import { PrismaService } from '../database/prisma.service';

describe('WorkerService', () => {
  let service: WorkerService;
  let prisma: PrismaService;

  const mockPrisma = {
    worker: {
      create: jest.fn().mockResolvedValue({ id: 'worker-id-123' }),
      update: jest.fn().mockResolvedValue({ id: 'worker-id-123', status: 'offline' }),
    },
    workerHeartbeat: {
      create: jest.fn().mockResolvedValue({}),
    },
    queue: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    job: {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
    },
    jobExecution: {
      create: jest.fn().mockResolvedValue({ id: BigInt(1) }),
      update: jest.fn().mockResolvedValue({}),
    },
    batch: {
      findUnique: jest.fn().mockResolvedValue({ id: 'batch-1', completed_jobs: 0, failed_jobs: 0, total_jobs: 2, status: 'processing' }),
      update: jest.fn().mockResolvedValue({}),
    },
    deadLetterQueue: {
      create: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn().mockImplementation(async (callback) => {
      if (typeof callback === 'function') {
        return callback(mockPrisma);
      }
      return callback;
    }),
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(1),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkerService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<WorkerService>(WorkerService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should register worker on init', async () => {
    await service.onModuleInit();
    expect(prisma.worker.create).toHaveBeenCalledWith({
      data: {
        hostname: expect.any(String),
        pid: expect.any(Number),
        status: 'active',
        concurrency_capacity: 10,
        current_load: 0,
      },
    });
  });

  it('should update worker status on destroy', async () => {
    await service.onModuleInit();
    await service.onModuleDestroy();
    expect(prisma.worker.update).toHaveBeenCalledWith({
      where: { id: 'worker-id-123' },
      data: { status: 'offline', current_load: 0 },
    });
  });

  describe('executeJob Batch Progress Updates', () => {
    it('should increment completed_jobs and update batch status to completed when all jobs finish successfully', async () => {
      await service.onModuleInit();
      const job = {
        id: 'job-1',
        queue_id: 'queue-1',
        type: 'success',
        batch_id: 'batch-1',
        attempt_count: 1,
        max_attempts: 3,
        payload: {},
      };

      // Mock runHandler to resolve immediately
      jest.spyOn(service as any, 'runHandler').mockResolvedValueOnce(undefined);

      // Mock batch to return total_jobs = 1, so it completes on this first successful job
      mockPrisma.batch.findUnique.mockResolvedValueOnce({
        id: 'batch-1',
        completed_jobs: 0,
        failed_jobs: 0,
        total_jobs: 1,
        status: 'processing',
      });

      await service['executeJob'](job);

      expect(mockPrisma.batch.update).toHaveBeenCalledWith({
        where: { id: 'batch-1' },
        data: {
          completed_jobs: 1,
          status: 'completed',
        },
      });
    });

    it('should increment failed_jobs and update batch status to failed when a job reaches max attempts and fails', async () => {
      await service.onModuleInit();
      const job = {
        id: 'job-2',
        queue_id: 'queue-1',
        type: 'fail',
        batch_id: 'batch-1',
        attempt_count: 3,
        max_attempts: 3,
        payload: {},
      };

      // Mock batch to return total_jobs = 1, so it fails on this dead-letter job
      mockPrisma.batch.findUnique.mockResolvedValueOnce({
        id: 'batch-1',
        completed_jobs: 0,
        failed_jobs: 0,
        total_jobs: 1,
        status: 'processing',
      });

      await service['executeJob'](job);

      expect(mockPrisma.batch.update).toHaveBeenCalledWith({
        where: { id: 'batch-1' },
        data: {
          failed_jobs: 1,
          status: 'failed',
        },
      });
    });
  });
});
