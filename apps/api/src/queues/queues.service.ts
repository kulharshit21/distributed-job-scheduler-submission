import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateQueueDto } from './dto/create-queue.dto';
import { UpdateQueueDto } from './dto/update-queue.dto';

@Injectable()
export class QueuesService {
  constructor(private prisma: PrismaService) {}

  async create(projectId: string, createQueueDto: CreateQueueDto, orgId: string) {
    // Verify project belongs to org
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, org_id: orgId },
    });
    if (!project) throw new NotFoundException('Project not found');

    const existing = await this.prisma.queue.findFirst({
      where: { project_id: projectId, name: createQueueDto.name },
    });
    if (existing) throw new ConflictException('Queue with this name already exists in project');

    return this.prisma.queue.create({
      data: {
        ...createQueueDto,
        project_id: projectId,
      },
    });
  }

  async findAll(projectId: string, orgId: string, limit: number = 25, cursor?: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, org_id: orgId },
    });
    if (!project) throw new NotFoundException('Project not found');

    const args: any = {
      where: { project_id: projectId },
      take: limit,
      orderBy: { id: 'asc' },
    };
    if (cursor) {
      args.cursor = { id: cursor };
      args.skip = 1;
    }
    return this.prisma.queue.findMany(args);
  }

  async findOne(id: string, orgId: string) {
    const queue = await this.prisma.queue.findFirst({
      where: { id, project: { org_id: orgId } },
      include: { project: true },
    });
    if (!queue) throw new NotFoundException('Queue not found');
    return queue;
  }

  async update(id: string, updateQueueDto: UpdateQueueDto, orgId: string) {
    await this.findOne(id, orgId);
    return this.prisma.queue.update({
      where: { id },
      data: updateQueueDto,
    });
  }

  async remove(id: string, orgId: string) {
    await this.findOne(id, orgId);
    return this.prisma.queue.delete({ where: { id } });
  }

  async pause(id: string, orgId: string) {
    await this.findOne(id, orgId);
    return this.prisma.queue.update({
      where: { id },
      data: { is_paused: true },
    });
  }

  async resume(id: string, orgId: string) {
    await this.findOne(id, orgId);
    return this.prisma.queue.update({
      where: { id },
      data: { is_paused: false },
    });
  }

  async stats(id: string, orgId: string) {
    await this.findOne(id, orgId);
    const queue = await this.prisma.queue.findUnique({ where: { id } });
    
    // Aggregate job stats
    const stats = await this.prisma.job.groupBy({
      by: ['status'],
      where: { queue_id: id },
      _count: { id: true },
    });

    const execStats = await this.prisma.jobExecution.aggregate({
      where: { job: { queue_id: id }, status: 'completed' },
      _avg: { duration_ms: true },
    });

    return {
      queue_id: id,
      current_running: queue?.current_running,
      is_paused: queue?.is_paused,
      job_counts: stats.reduce((acc, curr) => ({ ...acc, [curr.status]: curr._count.id }), {}),
      avg_duration_ms: execStats._avg.duration_ms || 0,
    };
  }
}
