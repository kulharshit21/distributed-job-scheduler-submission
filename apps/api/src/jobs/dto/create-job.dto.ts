import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsUUID,
  IsDateString,
  IsObject,
} from 'class-validator';

export class CreateJobDto {
  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsObject()
  payload!: any;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsString()
  idempotency_key?: string;

  @IsOptional()
  @IsDateString()
  run_at?: string;

  @IsOptional()
  @IsUUID()
  batch_id?: string;
}
