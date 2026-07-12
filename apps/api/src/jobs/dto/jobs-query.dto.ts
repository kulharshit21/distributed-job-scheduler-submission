import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class JobsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  status?: string;
}
