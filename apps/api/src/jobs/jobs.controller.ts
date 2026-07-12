import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { CreateScheduledJobDto } from './dto/create-scheduled-job.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateJobValidationPipe } from './dto/create-job-validation.pipe';
import { AddJobLogDto } from './dto/add-job-log.dto';
import { JobsQueryDto } from './dto/jobs-query.dto';

@UseGuards(JwtAuthGuard)
@Controller('api/v1')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post('queues/:queueId/jobs')
  createJob(
    @Param('queueId') queueId: string,
    @Body(CreateJobValidationPipe) dto: CreateJobDto | CreateJobDto[],
    @Req() req: any,
  ) {
    if (Array.isArray(dto)) {
      return this.jobsService.createBatch(queueId, req.user.orgId, dto);
    }
    return this.jobsService.createJob(queueId, req.user.orgId, dto);
  }

  @Post('queues/:queueId/scheduled-jobs')
  createScheduledJob(
    @Param('queueId') queueId: string,
    @Body() dto: CreateScheduledJobDto,
    @Req() req: any,
  ) {
    return this.jobsService.createScheduledJob(queueId, req.user.orgId, dto);
  }

  @Get('queues/:queueId/jobs')
  findAllJobs(
    @Param('queueId') queueId: string,
    @Req() req: any,
    @Query() query: JobsQueryDto,
  ) {
    return this.jobsService.findAllJobs(
      queueId,
      req.user.orgId,
      query.status,
      query.limit ?? 25,
      query.cursor,
    );
  }

  @Get('jobs/:id')
  getJob(@Param('id') id: string, @Req() req: any) {
    return this.jobsService.getJob(id, req.user.orgId);
  }

  @Post('jobs/:id/cancel')
  cancelJob(@Param('id') id: string, @Req() req: any) {
    return this.jobsService.cancelJob(id, req.user.orgId);
  }

  @Post('jobs/:id/requeue')
  requeueJob(@Param('id') id: string, @Req() req: any) {
    return this.jobsService.requeueJob(id, req.user.orgId);
  }

  @Get('jobs/:id/logs')
  getJobLogs(@Param('id') id: string, @Req() req: any) {
    return this.jobsService.getJobLogs(id, req.user.orgId);
  }

  @Post('jobs/:id/logs')
  addJobLog(
    @Param('id') id: string,
    @Body() body: AddJobLogDto,
    @Req() req: any,
  ) {
    return this.jobsService.addJobLog(
      id,
      req.user.orgId,
      body.message,
      body.level,
    );
  }
}
