import { IsString, MinLength, Matches } from 'class-validator';
import { IsNotEqualTo } from './validators/is-not-equal-to.validator';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_VALIDATION_REGEX,
  PASSWORD_VALIDATION_MESSAGE,
} from '../constants/auth.constants';

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`,
  })
  @Matches(PASSWORD_VALIDATION_REGEX, {
    message: PASSWORD_VALIDATION_MESSAGE,
  })
  @IsNotEqualTo('currentPassword', {
    message: 'New password must be different from current password',
  })
  newPassword: string;

  @IsString()
  newPasswordConfirmation: string;
}
