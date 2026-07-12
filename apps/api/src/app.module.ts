import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { ProjectsModule } from './projects/projects.module';
import { QueuesModule } from './queues/queues.module';
import { JobsModule } from './jobs/jobs.module';
import { MetricsModule } from './metrics/metrics.module';
import { EventsModule } from './events/events.module';

@Module({
  imports: [AuthModule, DatabaseModule, ProjectsModule, QueuesModule, JobsModule, MetricsModule, EventsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
