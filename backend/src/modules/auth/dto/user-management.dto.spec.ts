import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import {
  CreateInviteDto,
  AcceptInviteDto,
  UpdateRoleDto,
} from './user-management.dto';
import { UserRole } from '../enums/user-role.enum';

describe('User Management DTOs', () => {
  describe('CreateInviteDto', () => {
    describe('email validation', () => {
      it('should pass with valid email', async () => {
        const dto = plainToClass(CreateInviteDto, {
          email: 'test@example.com',
          role: UserRole.USER,
        });

        const errors = await validate(dto);
        expect(errors.length).toBe(0);
      });

      it('should fail with invalid email format', async () => {
        const dto = plainToClass(CreateInviteDto, {
          email: 'invalid-email',
          role: UserRole.USER,
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('email');
        expect(errors[0].constraints).toHaveProperty('isEmail');
      });

      it('should fail with missing email', async () => {
        const dto = plainToClass(CreateInviteDto, {
          role: UserRole.USER,
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        const emailError = errors.find((e) => e.property === 'email');
        expect(emailError).toBeDefined();
      });

      it('should fail with empty email', async () => {
        const dto = plainToClass(CreateInviteDto, {
          email: '',
          role: UserRole.USER,
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        const emailError = errors.find((e) => e.property === 'email');
        expect(emailError).toBeDefined();
      });
    });

    describe('role validation', () => {
      it('should pass with USER role', async () => {
        const dto = plainToClass(CreateInviteDto, {
          email: 'test@example.com',
          role: UserRole.USER,
        });

        const errors = await validate(dto);
        expect(errors.length).toBe(0);
      });

      it('should pass with ADMINISTRATOR role', async () => {
        const dto = plainToClass(CreateInviteDto, {
          email: 'test@example.com',
          role: UserRole.ADMINISTRATOR,
        });

        const errors = await validate(dto);
        expect(errors.length).toBe(0);
      });

      it('should fail with invalid role', async () => {
        const dto = plainToClass(CreateInviteDto, {
          email: 'test@example.com',
          role: 'invalid-role' as any,
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('role');
        expect(errors[0].constraints).toHaveProperty('isEnum');
      });

      it('should fail with missing role', async () => {
        const dto = plainToClass(CreateInviteDto, {
          email: 'test@example.com',
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        const roleError = errors.find((e) => e.property === 'role');
        expect(roleError).toBeDefined();
      });
    });
  });

  describe('UpdateRoleDto', () => {
    describe('role validation', () => {
      it('should pass with USER role', async () => {
        const dto = plainToClass(UpdateRoleDto, {
          role: UserRole.USER,
        });

        const errors = await validate(dto);
        expect(errors.length).toBe(0);
      });

      it('should pass with ADMINISTRATOR role', async () => {
        const dto = plainToClass(UpdateRoleDto, {
          role: UserRole.ADMINISTRATOR,
        });

        const errors = await validate(dto);
        expect(errors.length).toBe(0);
      });

      it('should fail with invalid role', async () => {
        const dto = plainToClass(UpdateRoleDto, {
          role: 'superadmin' as any,
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].property).toBe('role');
        expect(errors[0].constraints).toHaveProperty('isEnum');
      });

      it('should fail with missing role', async () => {
        const dto = plainToClass(UpdateRoleDto, {});

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        const roleError = errors.find((e) => e.property === 'role');
        expect(roleError).toBeDefined();
      });
    });
  });

  describe('AcceptInviteDto', () => {
    describe('password validation', () => {
      it('should pass with valid password', async () => {
        const dto = plainToClass(AcceptInviteDto, {
          password: 'ValidPass123!',
          passwordConfirmation: 'ValidPass123!',
        });

        const errors = await validate(dto);
        expect(errors.length).toBe(0);
      });

      it('should fail with password shorter than 12 characters', async () => {
        const dto = plainToClass(AcceptInviteDto, {
          password: 'Short1!',
          passwordConfirmation: 'Short1!',
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        const passwordError = errors.find((e) => e.property === 'password');
        expect(passwordError).toBeDefined();
        expect(passwordError?.constraints).toHaveProperty('minLength');
      });

      it('should fail with password missing lowercase letter', async () => {
        const dto = plainToClass(AcceptInviteDto, {
          password: 'UPPERCASE123!',
          passwordConfirmation: 'UPPERCASE123!',
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        const passwordError = errors.find((e) => e.property === 'password');
        expect(passwordError).toBeDefined();
        expect(passwordError?.constraints).toHaveProperty('matches');
      });

      it('should fail with password missing uppercase letter', async () => {
        const dto = plainToClass(AcceptInviteDto, {
          password: 'lowercase123!',
          passwordConfirmation: 'lowercase123!',
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        const passwordError = errors.find((e) => e.property === 'password');
        expect(passwordError).toBeDefined();
        expect(passwordError?.constraints).toHaveProperty('matches');
      });

      it('should fail with password missing digit', async () => {
        const dto = plainToClass(AcceptInviteDto, {
          password: 'NoDigitsHere!',
          passwordConfirmation: 'NoDigitsHere!',
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        const passwordError = errors.find((e) => e.property === 'password');
        expect(passwordError).toBeDefined();
        expect(passwordError?.constraints).toHaveProperty('matches');
      });

      it('should fail with password missing special character', async () => {
        const dto = plainToClass(AcceptInviteDto, {
          password: 'NoSpecialChar123',
          passwordConfirmation: 'NoSpecialChar123',
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        const passwordError = errors.find((e) => e.property === 'password');
        expect(passwordError).toBeDefined();
        expect(passwordError?.constraints).toHaveProperty('matches');
      });

      it('should pass with all allowed special characters', async () => {
        const specialChars = '!@#$%^&*()-_+=?.,:;<>/';

        for (const char of specialChars) {
          const password = `ValidPass123${char}`;
          const dto = plainToClass(AcceptInviteDto, {
            password,
            passwordConfirmation: password,
          });

          const errors = await validate(dto);
          expect(errors.length).toBe(0);
        }
      });

      it('should fail with empty password', async () => {
        const dto = plainToClass(AcceptInviteDto, {
          password: '',
          passwordConfirmation: '',
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        const passwordError = errors.find((e) => e.property === 'password');
        expect(passwordError).toBeDefined();
      });

      it('should fail with missing password', async () => {
        const dto = plainToClass(AcceptInviteDto, {
          passwordConfirmation: 'ValidPass123!',
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        const passwordError = errors.find((e) => e.property === 'password');
        expect(passwordError).toBeDefined();
      });
    });

    describe('passwordConfirmation validation', () => {
      it('should pass with valid passwordConfirmation', async () => {
        const dto = plainToClass(AcceptInviteDto, {
          password: 'ValidPass123!',
          passwordConfirmation: 'ValidPass123!',
        });

        const errors = await validate(dto);
        expect(errors.length).toBe(0);
      });

      it('should fail with missing passwordConfirmation', async () => {
        const dto = plainToClass(AcceptInviteDto, {
          password: 'ValidPass123!',
        });

        const errors = await validate(dto);
        expect(errors.length).toBeGreaterThan(0);
        const confirmError = errors.find(
          (e) => e.property === 'passwordConfirmation',
        );
        expect(confirmError).toBeDefined();
      });

      it('should pass with empty passwordConfirmation (validation happens at service level)', async () => {
        const dto = plainToClass(AcceptInviteDto, {
          password: 'ValidPass123!',
          passwordConfirmation: '',
        });

        const errors = await validate(dto);
        // Note: passwordConfirmation only has @IsString() decorator
        // Matching validation happens at the service level, not DTO level
        expect(errors.length).toBe(0);
      });
    });
  });
});
