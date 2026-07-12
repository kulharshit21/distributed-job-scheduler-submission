import { IsString, IsOptional, IsInt, Min, IsUUID } from 'class-validator';

export class UpdateQueueDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  concurrency_limit?: number;

  @IsOptional()
  @IsUUID()
  default_retry_policy_id?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  rate_limit_per_second?: number;
}
