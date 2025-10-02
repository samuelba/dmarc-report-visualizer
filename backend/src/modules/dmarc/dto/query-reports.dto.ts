import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsIn,
  IsISO8601,
} from 'class-validator';

export class QueryReportsDto {
  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsISO8601()
  from?: string; // ISO date string

  @IsOptional()
  @IsISO8601()
  to?: string; // ISO date string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  pageSize?: number = 20;

  @IsOptional()
  @IsIn(['beginDate', 'endDate', 'createdAt'])
  sort?: 'beginDate' | 'endDate' | 'createdAt' = 'beginDate';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc' = 'desc';
}
