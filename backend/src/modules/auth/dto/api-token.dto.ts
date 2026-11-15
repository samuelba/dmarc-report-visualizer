import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class CreateApiTokenDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  name: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  expiresInDays?: number;

  @IsOptional()
  @IsBoolean()
  allowRawXml?: boolean;
}
