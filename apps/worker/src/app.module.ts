import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WorkerModule } from './worker/worker.module';
import { DatabaseModule } from './database/database.module';
import { SchedulerModule } from './scheduler/scheduler.module';

@Module({
  imports: [DatabaseModule, WorkerModule, SchedulerModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
