import {
  IsEnum,
  IsOptional,
  IsBoolean,
  IsNumber,
  ValidateNested,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IpLookupProviderType } from '../config/ip-lookup.config';

class ApiKeysDto {
  @ApiPropertyOptional({ description: 'API key for IPLocate.io service' })
  @IsOptional()
  @IsString()
  iplocate?: string;
}

export class IpLookupConfigDto {
  @ApiProperty({
    enum: IpLookupProviderType,
    description: 'The primary IP lookup provider to use',
    example: IpLookupProviderType.GEOIP_LITE,
  })
  @IsEnum(IpLookupProviderType)
  provider: IpLookupProviderType;

  @ApiPropertyOptional({
    enum: IpLookupProviderType,
    isArray: true,
    description: 'Fallback providers to use if primary fails',
    example: [IpLookupProviderType.IP_API],
  })
  @IsOptional()
  @IsEnum(IpLookupProviderType, { each: true })
  fallbackProviders?: IpLookupProviderType[];

  @ApiPropertyOptional({
    type: ApiKeysDto,
    description: 'API keys for providers that require authentication',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ApiKeysDto)
  apiKeys?: ApiKeysDto;

  @ApiPropertyOptional({
    description: 'Whether to use caching for IP lookups',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  useCache?: boolean;

  @ApiPropertyOptional({
    description: 'Number of days before cache expires',
    default: 30,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  cacheExpirationDays?: number;

  @ApiPropertyOptional({
    description: 'Maximum number of retries for failed lookups',
    default: 2,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  maxRetries?: number;
}

export class IpLookupTestDto {
  @ApiProperty({
    description: 'IP address to test lookup',
    example: '8.8.8.8',
  })
  @IsString()
  ip: string;
}
