import {
  Controller,
  Get,
  Res,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../database/prisma.service';
import * as client from 'prom-client';

@Controller('metrics')
export class MetricsController {
  private readonly registry: client.Registry;
  private readonly jobsTotal: client.Gauge;

  constructor(private prisma: PrismaService) {
    this.registry = new client.Registry();
    client.collectDefaultMetrics({ register: this.registry });
    this.jobsTotal = new client.Gauge({
      name: 'job_scheduler_jobs_total',
      help: 'Total jobs by status',
      labelNames: ['status'],
      registers: [this.registry],
    });
  }

  @Get()
  async getMetrics(@Req() req: any, @Res() res: Response) {
    const metricsToken = process.env.METRICS_TOKEN;
    if (metricsToken) {
      const headerToken = req.headers['x-metrics-token'];
      const queryToken = req.query?.['token'];
      if (headerToken !== metricsToken && queryToken !== metricsToken) {
        throw new UnauthorizedException('Unauthorized');
      }
    }

    // Update gauges
    const stats = await this.prisma.job.groupBy({
      by: ['status'],
      _count: { id: true },
    });

    for (const stat of stats) {
      this.jobsTotal.labels(stat.status).set(stat._count.id);
    }

    res.set('Content-Type', this.registry.contentType);
    res.end(await this.registry.metrics());
  }
}
