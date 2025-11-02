import { IsEmail, IsString, MinLength, Matches } from 'class-validator';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_VALIDATION_REGEX,
  PASSWORD_VALIDATION_MESSAGE,
} from '../constants/auth.constants';

export class SetupDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

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
