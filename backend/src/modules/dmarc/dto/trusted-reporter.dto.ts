import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class TrustReporterDto {
  @ApiProperty({
    description: 'Organizational domain of the report <email>',
    example: 'yahooinc.com',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  claimedDomain: string;

  @ApiProperty({
    description: 'Exact authenticated sending domain',
    example: 'dmarc.yahoo.com',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  authDomain: string;

  @ApiProperty({ required: false, description: 'Why this pair is trusted' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}
