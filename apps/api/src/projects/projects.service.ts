import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  async create(
    createProjectDto: CreateProjectDto,
    userId: string,
    orgId: string,
  ) {
    return this.prisma.project.create({
      data: {
        name: createProjectDto.name,
        slug: createProjectDto.slug,
        org_id: orgId,
        created_by: userId,
        members: {
          create: {
            user_id: userId,
            role: 'owner',
          },
        },
      },
    });
  }

  async findAll(orgId: string, limit: number = 25, cursor?: string) {
    const args: any = {
      where: { org_id: orgId },
      take: limit,
      orderBy: { id: 'asc' },
    };
    if (cursor) {
      args.cursor = { id: cursor };
      args.skip = 1;
    }
    return this.prisma.project.findMany(args);
  }

  async findOne(id: string, orgId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, org_id: orgId },
      include: { queues: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async update(id: string, updateProjectDto: UpdateProjectDto, orgId: string) {
    await this.findOne(id, orgId); // ensures exists and belongs to org
    return this.prisma.project.update({
      where: { id },
      data: updateProjectDto,
    });
  }

  async remove(id: string, orgId: string) {
    await this.findOne(id, orgId);
    return this.prisma.project.delete({ where: { id } });
  }
}
