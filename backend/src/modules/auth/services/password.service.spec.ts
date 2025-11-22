import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PasswordService } from './password.service';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: unknown) => {
              if (key === 'BCRYPT_ROUNDS') {
                return 10;
              }
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<PasswordService>(PasswordService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('hashPassword', () => {
    it('should create a hash with bcrypt algorithm prefix', async () => {
      const password = 'TestPassword123!';
      const hash = await service.hashPassword(password);

      expect(hash).toMatch(/^bcrypt\$/);
      expect(hash.split('$').length).toBeGreaterThanOrEqual(2);
    });

    it('should create different hashes for the same password', async () => {
      const password = 'TestPassword123!';
      const hash1 = await service.hashPassword(password);
      const hash2 = await service.hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('validatePassword', () => {
    it('should validate correct password', async () => {
      const password = 'TestPassword123!';
      const hash = await service.hashPassword(password);

      const isValid = await service.validatePassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'TestPassword123!';
      const wrongPassword = 'WrongPassword123!';
      const hash = await service.hashPassword(password);

      const isValid = await service.validatePassword(wrongPassword, hash);
      expect(isValid).toBe(false);
    });

    it('should throw error for unsupported algorithm', async () => {
      const password = 'TestPassword123!';
      const invalidHash = 'unsupported$somehash';

      await expect(
        service.validatePassword(password, invalidHash),
      ).rejects.toThrow('Unsupported hash algorithm: unsupported');
    });

    it('should throw error for invalid hash format', async () => {
      const password = 'TestPassword123!';
      const invalidHash = 'noDollarSign';

      await expect(
        service.validatePassword(password, invalidHash),
      ).rejects.toThrow('Invalid hash format');
    });
  });

  describe('validatePasswordStrength', () => {
    it('should accept password meeting all requirements', () => {
      const password = 'ValidPassword123!';
      const result = service.validatePasswordStrength(password);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject password shorter than 12 characters', () => {
      const password = 'Short1!Aa';
      const result = service.validatePasswordStrength(password);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Password must be at least 12 characters long',
      );
    });

    it('should reject password without uppercase letter', () => {
      const password = 'lowercase123!';
      const result = service.validatePasswordStrength(password);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Password must contain at least one uppercase letter',
      );
    });

    it('should reject password without lowercase letter', () => {
      const password = 'UPPERCASE123!';
      const result = service.validatePasswordStrength(password);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Password must contain at least one lowercase letter',
      );
    });

    it('should reject password without number', () => {
      const password = 'NoNumbersHere!';
      const result = service.validatePasswordStrength(password);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Password must contain at least one number',
      );
    });

    it('should reject password without special character', () => {
      const password = 'NoSpecialChar123';
      const result = service.validatePasswordStrength(password);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Password must contain at least one special character (!@#$%^&*()-_+=?.,:;<>/)',
      );
    });

    it('should return multiple errors for password failing multiple requirements', () => {
      const password = 'short';
      const result = service.validatePasswordStrength(password);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
      expect(result.errors).toContain(
        'Password must be at least 12 characters long',
      );
      expect(result.errors).toContain(
        'Password must contain at least one uppercase letter',
      );
      expect(result.errors).toContain(
        'Password must contain at least one number',
      );
      expect(result.errors).toContain(
        'Password must contain at least one special character (!@#$%^&*()-_+=?.,:;<>/)',
      );
    });
  });

  describe('hash parsing', () => {
    it('should correctly parse bcrypt hash format', async () => {
      const password = 'TestPassword123!';
      const hash = await service.hashPassword(password);

      // Verify the hash can be validated (which requires correct parsing)
      const isValid = await service.validatePassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should extract algorithm from hash', async () => {
      const password = 'TestPassword123!';
      const hash = await service.hashPassword(password);

      expect(hash.startsWith('bcrypt$')).toBe(true);
    });
  });
});
