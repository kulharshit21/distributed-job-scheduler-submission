import { Module } from '@nestjs/common';
import { WorkerService } from './worker.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [WorkerService],
})
export class WorkerModule {}
