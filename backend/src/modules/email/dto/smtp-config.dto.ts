import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  Max,
  IsOptional,
  IsEnum,
  IsEmail,
  IsBoolean,
} from 'class-validator';

export class SmtpConfigDto {
  @IsString()
  @IsNotEmpty()
  host: string;

  @IsNumber()
  @Min(1)
  @Max(65535)
  @IsOptional()
  port?: number;

  @IsEnum(['none', 'tls', 'starttls'])
  securityMode: 'none' | 'tls' | 'starttls';

  @IsString()
  @IsOptional()
  username?: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsEmail()
  fromEmail: string;

  @IsString()
  @IsNotEmpty()
  fromName: string;

  @IsEmail()
  @IsOptional()
  replyToEmail?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}
