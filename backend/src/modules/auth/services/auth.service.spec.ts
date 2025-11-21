import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import {
  ConflictException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { User } from '../entities/user.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { PasswordService } from './password.service';
import { JwtService } from './jwt.service';
import { TotpService } from './totp.service';
import { RecoveryCodeService } from './recovery-code.service';
import * as crypto from 'crypto';

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: Repository<User>;
  let refreshTokenRepository: Repository<RefreshToken>;
  let passwordService: PasswordService;
  let jwtService: JwtService;

  const mockUser: User = {
    id: 'user-uuid-123',
    email: 'test@example.com',
    passwordHash: 'bcrypt$hashedpassword',
    authProvider: 'local',
    role: 'user' as any,
    organizationId: null,
    totpSecret: null,
    totpEnabled: false,
    totpEnabledAt: null,
    totpLastUsedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    refreshTokens: [],
    recoveryCodes: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            count: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: PasswordService,
          useValue: {
            hashPassword: jest.fn(),
            validatePassword: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            generateAccessToken: jest.fn(),
            generateRefreshToken: jest.fn(),
            generateTempToken: jest.fn(),
            verifyRefreshToken: jest.fn(),
            verifyAccessTokenIgnoreExpiration: jest.fn(),
            verifyTempToken: jest.fn(),
            getRefreshTokenExpiryMs: jest
              .fn()
              .mockReturnValue(7 * 24 * 60 * 60 * 1000),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              if (key === 'THEFT_DETECTION_ENABLED') {
                return 'true';
              }
              if (key === 'THEFT_DETECTION_INVALIDATE_FAMILY') {
                return 'true';
              }
              return defaultValue;
            }),
          },
        },
        {
          provide: TotpService,
          useValue: {
            validateToken: jest.fn(),
            getDecryptedSecret: jest.fn(),
            updateLastUsedTimestamp: jest.fn(),
          },
        },
        {
          provide: RecoveryCodeService,
          useValue: {
            validateRecoveryCode: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    refreshTokenRepository = module.get<Repository<RefreshToken>>(
      getRepositoryToken(RefreshToken),
    );
    passwordService = module.get<PasswordService>(PasswordService);
    jwtService = module.get<JwtService>(JwtService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('needsSetup', () => {
    it('should return true when no users exist', async () => {
      jest.spyOn(userRepository, 'count').mockResolvedValue(0);

      const result = await service.needsSetup();

      expect(result).toBe(true);
      expect(userRepository.count).toHaveBeenCalled();
    });

    it('should return false when users exist', async () => {
      jest.spyOn(userRepository, 'count').mockResolvedValue(1);

      const result = await service.needsSetup();

      expect(result).toBe(false);
      expect(userRepository.count).toHaveBeenCalled();
    });
  });

  describe('setup', () => {
    it('should create user with hashed password when no users exist', async () => {
      const email = 'admin@example.com';
      const password = 'SecurePassword123!';
      const hashedPassword = 'bcrypt$hashedvalue';

      jest.spyOn(userRepository, 'count').mockResolvedValue(0);
      jest
        .spyOn(passwordService, 'hashPassword')
        .mockResolvedValue(hashedPassword);
      jest.spyOn(userRepository, 'create').mockReturnValue(mockUser);
      jest.spyOn(userRepository, 'save').mockResolvedValue(mockUser);

      const result = await service.setup(email, password);

      expect(result).toEqual(mockUser);
      expect(passwordService.hashPassword).toHaveBeenCalledWith(password);
      expect(userRepository.create).toHaveBeenCalledWith({
        email,
        passwordHash: hashedPassword,
        authProvider: 'local',
        role: 'administrator',
      });
      expect(userRepository.save).toHaveBeenCalled();
    });

    it('should throw ConflictException if users already exist', async () => {
      jest.spyOn(userRepository, 'count').mockResolvedValue(1);

      await expect(
        service.setup('admin@example.com', 'SecurePassword123!'),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.setup('admin@example.com', 'SecurePassword123!'),
      ).rejects.toThrow('Setup has already been completed');
    });
  });

  describe('validateUser', () => {
    it('should return user when credentials are valid', async () => {
      const email = 'test@example.com';
      const password = 'ValidPassword123!';

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(passwordService, 'validatePassword').mockResolvedValue(true);

      const result = await service.validateUser(email, password);

      expect(result).toEqual(mockUser);
      expect(userRepository.findOne).toHaveBeenCalledWith({ where: { email } });
      expect(passwordService.validatePassword).toHaveBeenCalledWith(
        password,
        mockUser.passwordHash,
      );
    });

    it('should return null when user does not exist', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      const result = await service.validateUser(
        'nonexistent@example.com',
        'password',
      );

      expect(result).toBeNull();
      expect(passwordService.validatePassword).not.toHaveBeenCalled();
    });

    it('should return null when password is invalid', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(passwordService, 'validatePassword').mockResolvedValue(false);

      const result = await service.validateUser(
        'test@example.com',
        'wrongpassword',
      );

      expect(result).toBeNull();
    });
  });

  describe('login', () => {
    it('should generate access and refresh tokens when TOTP is not enabled', async () => {
      const accessToken = 'access-token-jwt';
      const refreshToken = 'refresh-token-jwt';
      const refreshTokenEntity = {
        id: 'token-uuid-123',
        userId: mockUser.id,
        token: '',
        expiresAt: new Date(),
        revoked: false,
        createdAt: new Date(),
      } as RefreshToken;

      jest
        .spyOn(jwtService, 'generateAccessToken')
        .mockReturnValue(accessToken);
      jest
        .spyOn(jwtService, 'generateRefreshToken')
        .mockReturnValue(refreshToken);
      jest
        .spyOn(refreshTokenRepository, 'create')
        .mockReturnValue(refreshTokenEntity);
      jest
        .spyOn(refreshTokenRepository, 'save')
        .mockResolvedValue(refreshTokenEntity);

      const result = await service.login(mockUser);

      // Type guard to check if it's not a TOTP required response
      if ('totpRequired' in result) {
        fail('Expected normal login response, got TOTP required');
      }

      expect(result.accessToken).toBe(accessToken);
      expect(result.refreshToken).toBe(refreshToken);
      expect(result.user).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        authProvider: mockUser.authProvider,
      });
      expect(jwtService.generateAccessToken).toHaveBeenCalledWith(
        mockUser.id,
        mockUser.email,
        mockUser.role,
        mockUser.authProvider,
        mockUser.organizationId,
      );
      expect(jwtService.generateRefreshToken).toHaveBeenCalledWith(
        mockUser.id,
        refreshTokenEntity.id,
      );
      expect(refreshTokenRepository.save).toHaveBeenCalledTimes(2);
    });

    it('should return TOTP required response when TOTP is enabled', async () => {
      const userWithTotp = {
        ...mockUser,
        totpEnabled: true,
        totpSecret: 'encrypted-secret',
      };
      const tempToken = 'temp-token-jwt';

      jest.spyOn(jwtService, 'generateTempToken').mockReturnValue(tempToken);

      const result = await service.login(userWithTotp);

      // Type guard to check if it's a TOTP required response
      if (!('totpRequired' in result)) {
        fail('Expected TOTP required response, got normal login');
      }

      expect(result.totpRequired).toBe(true);
      expect(result.tempToken).toBe(tempToken);
      expect(jwtService.generateTempToken).toHaveBeenCalledWith(
        userWithTotp.id,
        userWithTotp.email,
      );
    });

    it('should store hashed refresh token in database', async () => {
      const refreshToken = 'refresh-token-jwt';
      const refreshTokenEntity = {
        id: 'token-uuid-123',
        userId: mockUser.id,
        token: '',
        expiresAt: new Date(),
        revoked: false,
        createdAt: new Date(),
      } as RefreshToken;

      jest
        .spyOn(jwtService, 'generateAccessToken')
        .mockReturnValue('access-token');
      jest
        .spyOn(jwtService, 'generateRefreshToken')
        .mockReturnValue(refreshToken);
      jest
        .spyOn(refreshTokenRepository, 'create')
        .mockReturnValue(refreshTokenEntity);
      jest
        .spyOn(refreshTokenRepository, 'save')
        .mockResolvedValue(refreshTokenEntity);

      await service.login(mockUser);

      const expectedHash = crypto
        .createHash('sha256')
        .update(refreshToken)
        .digest('hex');
      expect(refreshTokenRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          token: expectedHash,
        }),
      );
    });
  });

  describe('refreshTokens', () => {
    const refreshToken = 'refresh-token-jwt';
    const accessToken = 'access-token-jwt';
    const hashedToken = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');
    const tokenPayload = {
      sub: mockUser.id,
      tokenId: 'token-uuid-123',
      iat: Date.now(),
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
    };
    const accessTokenPayload = {
      sub: mockUser.id,
      email: mockUser.email,
      authProvider: 'local',
      iat: Date.now(),
      exp: Date.now() - 1000, // Expired
    };

    it('should generate new access and refresh tokens with rotation', async () => {
      const storedToken = {
        id: 'token-uuid-123',
        token: hashedToken,
        userId: mockUser.id,
        familyId: 'family-uuid-123',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        revoked: false,
        user: mockUser,
        createdAt: new Date(),
      } as RefreshToken;

      const newRefreshTokenEntity = {
        id: 'new-token-uuid-456',
        userId: mockUser.id,
        familyId: 'family-uuid-123',
        token: '',
        expiresAt: new Date(),
        revoked: false,
        createdAt: new Date(),
      } as RefreshToken;

      jest
        .spyOn(jwtService, 'verifyRefreshToken')
        .mockReturnValue(tokenPayload);
      jest
        .spyOn(refreshTokenRepository, 'findOne')
        .mockResolvedValue(storedToken);
      jest
        .spyOn(refreshTokenRepository, 'update')
        .mockResolvedValue({ affected: 1 } as any);
      jest.spyOn(refreshTokenRepository, 'save').mockResolvedValue(storedToken);
      jest
        .spyOn(jwtService, 'generateAccessToken')
        .mockReturnValue('new-access-token');
      jest
        .spyOn(jwtService, 'generateRefreshToken')
        .mockReturnValue('new-refresh-token');
      jest
        .spyOn(refreshTokenRepository, 'create')
        .mockReturnValue(newRefreshTokenEntity);
      jest
        .spyOn(jwtService, 'verifyAccessTokenIgnoreExpiration')
        .mockReturnValue(accessTokenPayload);

      const result = await service.refreshTokens(refreshToken, accessToken);

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
      expect(refreshTokenRepository.update).toHaveBeenCalledWith(
        { id: storedToken.id, revoked: false },
        { revoked: true, revocationReason: 'rotation' },
      );
    });

    it('should throw UnauthorizedException when access and refresh tokens have mismatched users', async () => {
      const mismatchedAccessPayload = {
        sub: 'different-user-id',
        email: 'other@example.com',
        authProvider: 'local',
        iat: Date.now(),
        exp: Date.now() - 1000,
      };

      jest
        .spyOn(jwtService, 'verifyRefreshToken')
        .mockReturnValue(tokenPayload);
      jest
        .spyOn(jwtService, 'verifyAccessTokenIgnoreExpiration')
        .mockReturnValue(mismatchedAccessPayload);

      await expect(
        service.refreshTokens(refreshToken, accessToken),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.refreshTokens(refreshToken, accessToken),
      ).rejects.toThrow('Access token does not match refresh token');
    });

    it('should throw UnauthorizedException if token not found in database', async () => {
      jest
        .spyOn(jwtService, 'verifyRefreshToken')
        .mockReturnValue(tokenPayload);
      jest
        .spyOn(jwtService, 'verifyAccessTokenIgnoreExpiration')
        .mockReturnValue(accessTokenPayload);
      jest.spyOn(refreshTokenRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.refreshTokens(refreshToken, accessToken),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.refreshTokens(refreshToken, accessToken),
      ).rejects.toThrow('Invalid refresh token');
    });

    it('should throw UnauthorizedException if token is revoked', async () => {
      const revokedToken = {
        id: 'token-uuid-123',
        token: hashedToken,
        userId: mockUser.id,
        familyId: 'family-uuid-123',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        revoked: true,
        revocationReason: 'rotation',
        user: mockUser,
        createdAt: new Date(),
      } as RefreshToken;

      jest
        .spyOn(jwtService, 'verifyRefreshToken')
        .mockReturnValue(tokenPayload);
      jest
        .spyOn(jwtService, 'verifyAccessTokenIgnoreExpiration')
        .mockReturnValue(accessTokenPayload);
      jest
        .spyOn(refreshTokenRepository, 'findOne')
        .mockResolvedValue(revokedToken);
      jest
        .spyOn(refreshTokenRepository, 'update')
        .mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });

      await expect(
        service.refreshTokens(refreshToken, accessToken),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.refreshTokens(refreshToken, accessToken),
      ).rejects.toThrow(
        'Your session has been terminated for security reasons',
      );
    });

    it('should throw UnauthorizedException if token is expired', async () => {
      const expiredToken = {
        id: 'token-uuid-123',
        token: hashedToken,
        userId: mockUser.id,
        expiresAt: new Date(Date.now() - 1000), // Expired
        revoked: false,
        user: mockUser,
        createdAt: new Date(),
      } as RefreshToken;

      jest
        .spyOn(jwtService, 'verifyRefreshToken')
        .mockReturnValue(tokenPayload);
      jest
        .spyOn(jwtService, 'verifyAccessTokenIgnoreExpiration')
        .mockReturnValue(accessTokenPayload);
      jest
        .spyOn(refreshTokenRepository, 'findOne')
        .mockResolvedValue(expiredToken);

      await expect(
        service.refreshTokens(refreshToken, accessToken),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.refreshTokens(refreshToken, accessToken),
      ).rejects.toThrow('Refresh token has expired');
    });
  });

  describe('logout', () => {
    const refreshToken = 'refresh-token-jwt';
    const hashedToken = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');
    const tokenPayload = {
      sub: mockUser.id,
      tokenId: 'token-uuid-123',
      iat: Date.now(),
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
    };

    it('should revoke refresh token', async () => {
      const storedToken = {
        id: 'token-uuid-123',
        token: hashedToken,
        userId: mockUser.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        revoked: false,
        createdAt: new Date(),
      } as RefreshToken;

      jest
        .spyOn(jwtService, 'verifyRefreshToken')
        .mockReturnValue(tokenPayload);
      jest
        .spyOn(refreshTokenRepository, 'findOne')
        .mockResolvedValue(storedToken);
      jest.spyOn(refreshTokenRepository, 'save').mockResolvedValue(storedToken);

      await service.logout(mockUser.id, refreshToken);

      expect(storedToken.revoked).toBe(true);
      expect(refreshTokenRepository.save).toHaveBeenCalledWith(storedToken);
    });

    it('should throw UnauthorizedException if token belongs to different user', async () => {
      const differentUserPayload = {
        ...tokenPayload,
        sub: 'different-user-id',
      };

      jest
        .spyOn(jwtService, 'verifyRefreshToken')
        .mockReturnValue(differentUserPayload);

      await expect(service.logout(mockUser.id, refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.logout(mockUser.id, refreshToken)).rejects.toThrow(
        'Invalid refresh token',
      );
    });

    it('should not throw error if token not found in database', async () => {
      jest
        .spyOn(jwtService, 'verifyRefreshToken')
        .mockReturnValue(tokenPayload);
      jest.spyOn(refreshTokenRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.logout(mockUser.id, refreshToken),
      ).resolves.not.toThrow();
    });
  });

  describe('changePassword', () => {
    it('should update password hash and invalidate all refresh tokens', async () => {
      const currentPassword = 'OldPassword123!';
      const newPassword = 'NewPassword123!';
      const newPasswordHash = 'bcrypt$newhashedvalue';
      const userCopy = { ...mockUser };

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(userCopy);
      jest.spyOn(passwordService, 'validatePassword').mockResolvedValue(true);
      jest
        .spyOn(passwordService, 'hashPassword')
        .mockResolvedValue(newPasswordHash);
      jest.spyOn(userRepository, 'save').mockResolvedValue(userCopy);
      jest.spyOn(refreshTokenRepository, 'update').mockResolvedValue({} as any);

      await service.changePassword(mockUser.id, currentPassword, newPassword);

      expect(passwordService.validatePassword).toHaveBeenCalledWith(
        currentPassword,
        mockUser.passwordHash,
      );
      expect(passwordService.hashPassword).toHaveBeenCalledWith(newPassword);
      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          passwordHash: newPasswordHash,
        }),
      );
      expect(refreshTokenRepository.update).toHaveBeenCalledWith(
        { userId: mockUser.id, revoked: false },
        { revoked: true, revocationReason: 'password_change' },
      );
    });

    it('should throw NotFoundException if user not found', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.changePassword(
          'nonexistent-id',
          'OldPassword123!',
          'NewPassword123!',
        ),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.changePassword(
          'nonexistent-id',
          'OldPassword123!',
          'NewPassword123!',
        ),
      ).rejects.toThrow('User not found');
    });

    it('should throw UnauthorizedException if current password is incorrect', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(passwordService, 'validatePassword').mockResolvedValue(false);

      await expect(
        service.changePassword(
          mockUser.id,
          'WrongPassword123!',
          'NewPassword123!',
        ),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.changePassword(
          mockUser.id,
          'WrongPassword123!',
          'NewPassword123!',
        ),
      ).rejects.toThrow('Current password is incorrect');
    });
  });
});
