import {
  IsString,
  IsNotEmpty,
  Length,
  Matches,
  IsArray,
} from 'class-validator';

/**
 * Response DTO for TOTP setup initiation
 * Contains the secret and QR code for authenticator app setup
 */
export class TotpSetupResponseDto {
  @IsString()
  @IsNotEmpty()
  secret: string;

  @IsString()
  @IsNotEmpty()
  qrCodeUrl: string;

  @IsString()
  @IsNotEmpty()
  otpauthUrl: string;
}

/**
 * Request DTO for enabling TOTP
 * Requires the secret and a valid TOTP token for verification
 */
export class TotpEnableDto {
  @IsString()
  @IsNotEmpty()
  secret: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'TOTP token must be exactly 6 digits' })
  @Matches(/^[0-9]{6}$/, { message: 'TOTP token must contain only digits' })
  token: string;
}

/**
 * Response DTO for TOTP enable
 * Contains the recovery codes that should be saved by the user
 */
export class TotpEnableResponseDto {
  @IsArray()
  @IsString({ each: true })
  recoveryCodes: string[];
}

/**
 * Request DTO for disabling TOTP
 * Requires password and current TOTP token for security
 */
export class TotpDisableDto {
  @IsString()
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'TOTP token must be exactly 6 digits' })
  @Matches(/^[0-9]{6}$/, { message: 'TOTP token must contain only digits' })
  token: string;
}

/**
 * Request DTO for verifying TOTP during login
 * Uses temporary token from HttpOnly cookie and TOTP code
 */
export class TotpVerifyDto {
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'TOTP code must be exactly 6 digits' })
  @Matches(/^[0-9]{6}$/, { message: 'TOTP code must contain only digits' })
  totpCode: string;
}

/**
 * Request DTO for verifying recovery code during login
 * Uses temporary token from HttpOnly cookie and recovery code
 */
export class RecoveryCodeVerifyDto {
  @IsString()
  @IsNotEmpty()
  @Length(19, 19, {
    message: 'Recovery code must be in format XXXX-XXXX-XXXX-XXXX',
  })
  @Matches(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/, {
    message: 'Recovery code must be in format XXXX-XXXX-XXXX-XXXX',
  })
  recoveryCode: string;
}

/**
 * Response DTO for TOTP status
 * Shows current TOTP configuration and usage information
 */
export class TotpStatusResponseDto {
  enabled: boolean;

  lastUsed: Date | null;

  recoveryCodesRemaining: number;
}
