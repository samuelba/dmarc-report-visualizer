import { IsEnum, IsEmail, IsString, MinLength, Matches } from 'class-validator';
import { UserRole } from '../enums/user-role.enum';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_VALIDATION_REGEX,
  PASSWORD_VALIDATION_MESSAGE,
} from '../constants/auth.constants';

/**
 * DTO for updating a user's role
 */
export class UpdateRoleDto {
  @IsEnum(UserRole)
  role: UserRole;
}

/**
 * DTO for creating an invite
 */
export class CreateInviteDto {
  @IsEmail()
  email: string;

  @IsEnum(UserRole)
  role: UserRole;
}

/**
 * DTO for accepting an invite
 */
export class AcceptInviteDto {
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`,
  })
  @Matches(PASSWORD_VALIDATION_REGEX, {
    message: PASSWORD_VALIDATION_MESSAGE,
  })
  password: string;

  @IsString()
  passwordConfirmation: string;
}

/**
 * Response interface for user data
 */
export interface UserResponse {
  id: string;
  email: string;
  role: UserRole;
  authProvider: string;
  createdAt: Date;
  totpEnabled: boolean;
}

/**
 * Response interface for invite creation
 */
export interface InviteResponse {
  id: string;
  email: string;
  role: UserRole;
  token: string;
  inviteLink: string;
  expiresAt: Date;
  emailStatus: 'sent' | 'failed' | 'not_configured';
}

/**
 * Response interface for invite token (used in getActiveInvites)
 */
export interface InviteTokenResponse {
  id: string;
  email: string;
  role: UserRole;
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
}

/**
 * Response interface for invite details
 */
export interface InviteDetailsResponse {
  valid: boolean;
  email?: string;
  role?: UserRole;
  expiresAt?: Date;
  error?: string;
}
