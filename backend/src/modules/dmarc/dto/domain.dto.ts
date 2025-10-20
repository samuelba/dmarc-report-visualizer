import { IsString, IsOptional, MaxLength, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDomainDto {
  @ApiProperty({ description: 'Domain name', example: 'example.com' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  domain: string;

  @ApiProperty({ description: 'Notes about the domain', required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateDomainDto {
  @ApiProperty({ description: 'Notes about the domain', required: false })
  @IsString()
  @IsOptional()
  notes?: string | null;
}

export class QueryDomainsDto {
  @ApiProperty({
    description: 'Number of days to look back for statistics',
    required: false,
    default: 30,
  })
  @IsOptional()
  daysBack?: number;
}

export class DomainStatisticsDto {
  id?: string;
  domain: string;
  isManaged: boolean;
  totalMessages: number;
  passedMessages: number;
  failedMessages: number;
  dmarcPassRate: number;
  spfPassRate: number;
  dkimPassRate: number;
  uniqueSources: number;
  notes?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}
