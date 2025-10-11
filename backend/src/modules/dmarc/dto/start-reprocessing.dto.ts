import { IsOptional, IsDateString } from 'class-validator';

/**
 * DTO for starting a reprocessing job
 */
export class StartReprocessingDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
