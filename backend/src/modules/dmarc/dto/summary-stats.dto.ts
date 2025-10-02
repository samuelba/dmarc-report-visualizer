import { Type } from 'class-transformer';
import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

export class StatsQueryDto {
  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}

export class TimeSeriesQueryDto extends StatsQueryDto {
  @IsOptional()
  @IsIn(['day', 'week'])
  interval?: 'day' | 'week' = 'day';
}

export class TopSourcesQueryDto extends StatsQueryDto {
  @IsOptional()
  @Type(() => Number)
  limit?: number = 10;
}
