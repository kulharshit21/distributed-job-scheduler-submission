import { IsString, IsNotEmpty, IsObject, IsOptional } from 'class-validator';

export class CreateScheduledJobDto {
  @IsString()
  @IsNotEmpty()
  cron_expression!: string;

  @IsObject()
  job_template!: any;

  @IsOptional()
  @IsString()
  timezone?: string;
}
