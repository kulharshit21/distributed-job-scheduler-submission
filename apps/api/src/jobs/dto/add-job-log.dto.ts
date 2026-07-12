import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class AddJobLogDto {
  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsString()
  @IsOptional()
  level?: string;
}
