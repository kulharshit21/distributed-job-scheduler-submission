import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class CreateQueueDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsInt()
  @Min(1)
  concurrency_limit!: number;

  @IsOptional()
  @IsUUID()
  default_retry_policy_id?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  rate_limit_per_second?: number;
}
