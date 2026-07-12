import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { QueuesService } from './queues.service';
import { CreateQueueDto } from './dto/create-queue.dto';
import { UpdateQueueDto } from './dto/update-queue.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@UseGuards(JwtAuthGuard)
@Controller('api/v1')
export class QueuesController {
  constructor(private readonly queuesService: QueuesService) {}

  @Post('projects/:projectId/queues')
  create(
    @Param('projectId') projectId: string,
    @Body() createQueueDto: CreateQueueDto,
    @Req() req: any,
  ) {
    return this.queuesService.create(projectId, createQueueDto, req.user.orgId);
  }

  @Get('projects/:projectId/queues')
  findAll(
    @Param('projectId') projectId: string,
    @Req() req: any,
    @Query() query: PaginationQueryDto,
  ) {
    return this.queuesService.findAll(
      projectId,
      req.user.orgId,
      query.limit ?? 25,
      query.cursor,
    );
  }

  @Get('queues/:id')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.queuesService.findOne(id, req.user.orgId);
  }

  @Patch('queues/:id')
  update(
    @Param('id') id: string,
    @Body() updateQueueDto: UpdateQueueDto,
    @Req() req: any,
  ) {
    return this.queuesService.update(id, updateQueueDto, req.user.orgId);
  }

  @Delete('queues/:id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.queuesService.remove(id, req.user.orgId);
  }

  @Post('queues/:id/pause')
  pause(@Param('id') id: string, @Req() req: any) {
    return this.queuesService.pause(id, req.user.orgId);
  }

  @Post('queues/:id/resume')
  resume(@Param('id') id: string, @Req() req: any) {
    return this.queuesService.resume(id, req.user.orgId);
  }

  @Get('queues/:id/stats')
  stats(@Param('id') id: string, @Req() req: any) {
    return this.queuesService.stats(id, req.user.orgId);
  }
}
