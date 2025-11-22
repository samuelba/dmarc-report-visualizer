import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository, UpdateResult } from 'typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { User } from '../entities/user.entity';
import {
  RefreshToken,
  RevocationReason,
} from '../entities/refresh-token.entity';
import { RecoveryCode } from '../entities/recovery-code.entity';
import { PasswordService } from './password.service';
import { JwtService } from './jwt.service';
import { TotpService } from './totp.service';
import { RecoveryCodeService } from './recovery-code.service';
import * as crypto from 'crypto';

describe('AuthService - Theft Detection', () => {
  let service: AuthService;
  let userRepository: Repository<User>;
  let refreshTokenRepository: Repository<RefreshToken>;
  let passwordService: PasswordService;
  let jwtService: JwtService;
  let configService: ConfigService;

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
            verifyRefreshToken: jest.fn(),
            verifyAccessTokenIgnoreExpiration: jest.fn().mockReturnValue({
              sub: 'user-uuid-123',
              email: 'test@example.com',
              authProvider: 'local',
            }),
            getRefreshTokenExpiryMs: jest
              .fn()
              .mockReturnValue(7 * 24 * 60 * 60 * 1000),
          },
        },
        {
          provide: TotpService,
          useValue: {
            generateSecret: jest.fn(),
            verifyToken: jest.fn(),
            generateQRCode: jest.fn(),
          },
        },
        {
          provide: RecoveryCodeService,
          useValue: {
            generateCodes: jest.fn(),
            validateCode: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(RecoveryCode),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              if (key === 'auth.theftDetection') {
                return { enabled: true, invalidateFamily: true };
              }
              return defaultValue;
            }),
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
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('Token Family Tracking (8.1)', () => {
    it('should create token with new familyId on login', async () => {
      const refreshTokenEntity = {
        id: 'token-uuid-123',
        userId: mockUser.id,
        familyId: 'family-uuid-123',
        token: '',
        expiresAt: new Date(),
        revoked: false,
        revocationReason: null,
        createdAt: new Date(),
      } as RefreshToken;

      jest
        .spyOn(jwtService, 'generateAccessToken')
        .mockReturnValue('access-token');
      jest
        .spyOn(jwtService, 'generateRefreshToken')
        .mockReturnValue('refresh-token');
      jest
        .spyOn(refreshTokenRepository, 'create')
        .mockReturnValue(refreshTokenEntity);
      jest
        .spyOn(refreshTokenRepository, 'save')
        .mockResolvedValue(refreshTokenEntity);

      await service.login(mockUser);

      expect(refreshTokenRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUser.id,
          familyId: expect.any(String),
          revoked: false,
          revocationReason: null,
        }),
      );
    });

    it('should preserve familyId during token rotation', async () => {
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
      jest.spyOn(refreshTokenRepository, 'update').mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      } as UpdateResult);
      jest
        .spyOn(refreshTokenRepository, 'create')
        .mockReturnValue(newRefreshTokenEntity);
      jest
        .spyOn(refreshTokenRepository, 'save')
        .mockResolvedValue(newRefreshTokenEntity);
      jest
        .spyOn(jwtService, 'generateAccessToken')
        .mockReturnValue('new-access-token');
      jest
        .spyOn(jwtService, 'generateRefreshToken')
        .mockReturnValue('new-refresh-token');

      await service.refreshTokens(refreshToken, 'access-token');

      expect(refreshTokenRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          familyId: 'family-uuid-123',
        }),
      );
    });

    it('should store familyId in database', async () => {
      const refreshTokenEntity = {
        id: 'token-uuid-123',
        userId: mockUser.id,
        familyId: 'family-uuid-123',
        token: '',
        expiresAt: new Date(),
        revoked: false,
        revocationReason: null,
        createdAt: new Date(),
      } as RefreshToken;

      jest
        .spyOn(jwtService, 'generateAccessToken')
        .mockReturnValue('access-token');
      jest
        .spyOn(jwtService, 'generateRefreshToken')
        .mockReturnValue('refresh-token');
      jest
        .spyOn(refreshTokenRepository, 'create')
        .mockReturnValue(refreshTokenEntity);
      jest
        .spyOn(refreshTokenRepository, 'save')
        .mockResolvedValue(refreshTokenEntity);

      await service.login(mockUser);

      expect(refreshTokenRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          familyId: expect.any(String),
        }),
      );
    });
  });

  describe('Revocation Reason Tracking (8.2)', () => {
    it('should set revocationReason to rotation during token refresh', async () => {
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
      jest.spyOn(refreshTokenRepository, 'update').mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      } as UpdateResult);
      jest
        .spyOn(refreshTokenRepository, 'create')
        .mockReturnValue(newRefreshTokenEntity);
      jest
        .spyOn(refreshTokenRepository, 'save')
        .mockResolvedValue(newRefreshTokenEntity);
      jest
        .spyOn(jwtService, 'generateAccessToken')
        .mockReturnValue('new-access-token');
      jest
        .spyOn(jwtService, 'generateRefreshToken')
        .mockReturnValue('new-refresh-token');

      await service.refreshTokens(refreshToken, 'access-token');

      expect(refreshTokenRepository.update).toHaveBeenCalledWith(
        { id: storedToken.id, revoked: false },
        { revoked: true, revocationReason: RevocationReason.ROTATION },
      );
    });

    it('should set revocationReason to logout during logout', async () => {
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

      expect(storedToken.revocationReason).toBe(RevocationReason.LOGOUT);
      expect(refreshTokenRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          revoked: true,
          revocationReason: RevocationReason.LOGOUT,
        }),
      );
    });

    it('should set revocationReason to password_change during password change', async () => {
      const userCopy = { ...mockUser };

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(userCopy);
      jest.spyOn(passwordService, 'validatePassword').mockResolvedValue(true);
      jest.spyOn(passwordService, 'hashPassword').mockResolvedValue('new-hash');
      jest.spyOn(userRepository, 'save').mockResolvedValue(userCopy);
      jest.spyOn(refreshTokenRepository, 'update').mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      } as UpdateResult);

      await service.changePassword(mockUser.id, 'OldPass123!', 'NewPass123!');

      expect(refreshTokenRepository.update).toHaveBeenCalledWith(
        { userId: mockUser.id, revoked: false },
        { revoked: true, revocationReason: RevocationReason.PASSWORD_CHANGE },
      );
    });

    it('should set revocationReason to theft_detected when theft is detected', async () => {
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

      const revokedToken = {
        id: 'token-uuid-123',
        token: hashedToken,
        userId: mockUser.id,
        familyId: 'family-uuid-123',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        revoked: true,
        revocationReason: RevocationReason.ROTATION,
        user: mockUser,
        createdAt: new Date(),
      } as RefreshToken;

      jest
        .spyOn(jwtService, 'verifyRefreshToken')
        .mockReturnValue(tokenPayload);
      jest
        .spyOn(refreshTokenRepository, 'findOne')
        .mockResolvedValue(revokedToken);
      jest.spyOn(refreshTokenRepository, 'update').mockResolvedValue({
        affected: 2,
        raw: [],
        generatedMaps: [],
      } as UpdateResult);

      try {
        await service.refreshTokens(refreshToken, 'access-token');
      } catch (_error) {
        // Expected to throw
      }

      expect(refreshTokenRepository.update).toHaveBeenCalledWith(
        { familyId: 'family-uuid-123', revoked: false },
        { revoked: true, revocationReason: RevocationReason.THEFT_DETECTED },
      );
    });
  });

  describe('Theft Detection Triggers (8.3)', () => {
    it('should trigger theft detection when revoked token is reused', async () => {
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

      const revokedToken = {
        id: 'token-uuid-123',
        token: hashedToken,
        userId: mockUser.id,
        familyId: 'family-uuid-123',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        revoked: true,
        revocationReason: RevocationReason.ROTATION,
        user: mockUser,
        createdAt: new Date(),
      } as RefreshToken;

      jest
        .spyOn(jwtService, 'verifyRefreshToken')
        .mockReturnValue(tokenPayload);
      jest
        .spyOn(refreshTokenRepository, 'findOne')
        .mockResolvedValue(revokedToken);
      jest.spyOn(refreshTokenRepository, 'update').mockResolvedValue({
        affected: 2,
        raw: [],
        generatedMaps: [],
      } as UpdateResult);

      await expect(
        service.refreshTokens(refreshToken, 'access-token'),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.refreshTokens(refreshToken, 'access-token'),
      ).rejects.toThrow(
        'Your session has been terminated for security reasons',
      );

      // Verify family invalidation was called
      expect(refreshTokenRepository.update).toHaveBeenCalledWith(
        { familyId: 'family-uuid-123', revoked: false },
        { revoked: true, revocationReason: RevocationReason.THEFT_DETECTED },
      );
    });

    it('should not trigger theft detection for expired (non-revoked) token', async () => {
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
        .spyOn(refreshTokenRepository, 'findOne')
        .mockResolvedValue(expiredToken);
      const updateSpy = jest.spyOn(refreshTokenRepository, 'update');

      await expect(
        service.refreshTokens(refreshToken, 'access-token'),
      ).rejects.toThrow('Refresh token has expired');

      // Verify family invalidation was NOT called
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('should not trigger theft detection for invalid token', async () => {
      const refreshToken = 'refresh-token-jwt';
      const tokenPayload = {
        sub: mockUser.id,
        tokenId: 'token-uuid-123',
        iat: Date.now(),
        exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
      };

      jest
        .spyOn(jwtService, 'verifyRefreshToken')
        .mockReturnValue(tokenPayload);
      jest.spyOn(refreshTokenRepository, 'findOne').mockResolvedValue(null);
      const updateSpy = jest.spyOn(refreshTokenRepository, 'update');

      await expect(
        service.refreshTokens(refreshToken, 'access-token'),
      ).rejects.toThrow('Invalid refresh token');

      // Verify family invalidation was NOT called
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('should proceed with normal rotation for valid token', async () => {
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
      jest.spyOn(refreshTokenRepository, 'update').mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      } as UpdateResult);
      jest
        .spyOn(refreshTokenRepository, 'create')
        .mockReturnValue(newRefreshTokenEntity);
      jest
        .spyOn(refreshTokenRepository, 'save')
        .mockResolvedValue(newRefreshTokenEntity);
      jest
        .spyOn(jwtService, 'generateAccessToken')
        .mockReturnValue('new-access-token');
      jest
        .spyOn(jwtService, 'generateRefreshToken')
        .mockReturnValue('new-refresh-token');

      const result = await service.refreshTokens(refreshToken, 'access-token');

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
      expect(refreshTokenRepository.update).toHaveBeenCalledWith(
        { id: storedToken.id, revoked: false },
        { revoked: true, revocationReason: RevocationReason.ROTATION },
      );
    });
  });

  describe('Atomic Conditional UPDATE (8.4)', () => {
    it('should trigger theft detection when concurrent token use (affected=0)', async () => {
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

      // Reloaded token after concurrent revocation (has revocationReason set)
      const reloadedToken = {
        ...storedToken,
        revoked: true,
        revocationReason: RevocationReason.ROTATION,
      } as RefreshToken;

      jest
        .spyOn(jwtService, 'verifyRefreshToken')
        .mockReturnValue(tokenPayload);

      // First findOne: initial token lookup (not revoked yet)
      // Second findOne: reload after detecting concurrent use (now revoked with reason)
      jest
        .spyOn(refreshTokenRepository, 'findOne')
        .mockResolvedValueOnce(storedToken)
        .mockResolvedValueOnce(reloadedToken);

      // First call to update (atomic revocation) returns affected=0 (concurrent use)
      // Second call to update (family invalidation) returns affected=2
      const updateSpy = jest
        .spyOn(refreshTokenRepository, 'update')
        .mockResolvedValueOnce({
          affected: 0,
          raw: [],
          generatedMaps: [],
        } as UpdateResult)
        .mockResolvedValueOnce({
          affected: 2,
          raw: [],
          generatedMaps: [],
        } as UpdateResult);

      try {
        await service.refreshTokens(refreshToken, 'access-token');
        fail('Should have thrown UnauthorizedException');
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        expect(error.message).toContain(
          'Your session has been terminated for security reasons',
        );
      }

      // Verify both UPDATE calls were made
      expect(updateSpy).toHaveBeenCalledTimes(2);
      expect(updateSpy).toHaveBeenNthCalledWith(
        1,
        { id: storedToken.id, revoked: false },
        { revoked: true, revocationReason: RevocationReason.ROTATION },
      );
      expect(updateSpy).toHaveBeenNthCalledWith(
        2,
        { familyId: 'family-uuid-123', revoked: false },
        { revoked: true, revocationReason: RevocationReason.THEFT_DETECTED },
      );
    });

    it('should proceed normally when successful revocation (affected=1)', async () => {
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
      jest.spyOn(refreshTokenRepository, 'update').mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      } as UpdateResult);
      jest
        .spyOn(refreshTokenRepository, 'create')
        .mockReturnValue(newRefreshTokenEntity);
      jest
        .spyOn(refreshTokenRepository, 'save')
        .mockResolvedValue(newRefreshTokenEntity);
      jest
        .spyOn(jwtService, 'generateAccessToken')
        .mockReturnValue('new-access-token');
      jest
        .spyOn(jwtService, 'generateRefreshToken')
        .mockReturnValue('new-refresh-token');

      const result = await service.refreshTokens(refreshToken, 'access-token');

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
      // Only one UPDATE call (the atomic revocation)
      expect(refreshTokenRepository.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('Token Family Invalidation (8.5)', () => {
    it('should revoke all tokens in family when theft detected', async () => {
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

      const revokedToken = {
        id: 'token-uuid-123',
        token: hashedToken,
        userId: mockUser.id,
        familyId: 'family-uuid-123',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        revoked: true,
        revocationReason: RevocationReason.ROTATION,
        user: mockUser,
        createdAt: new Date(),
      } as RefreshToken;

      jest
        .spyOn(jwtService, 'verifyRefreshToken')
        .mockReturnValue(tokenPayload);
      jest
        .spyOn(refreshTokenRepository, 'findOne')
        .mockResolvedValue(revokedToken);
      jest.spyOn(refreshTokenRepository, 'update').mockResolvedValue({
        affected: 3,
        raw: [],
        generatedMaps: [],
      } as UpdateResult);

      try {
        await service.refreshTokens(refreshToken, 'access-token');
      } catch (_error) {
        // Expected to throw
      }

      expect(refreshTokenRepository.update).toHaveBeenCalledWith(
        { familyId: 'family-uuid-123', revoked: false },
        { revoked: true, revocationReason: RevocationReason.THEFT_DETECTED },
      );
    });

    it('should not affect tokens in different families', async () => {
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

      const revokedToken = {
        id: 'token-uuid-123',
        token: hashedToken,
        userId: mockUser.id,
        familyId: 'family-uuid-123',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        revoked: true,
        revocationReason: RevocationReason.ROTATION,
        user: mockUser,
        createdAt: new Date(),
      } as RefreshToken;

      jest
        .spyOn(jwtService, 'verifyRefreshToken')
        .mockReturnValue(tokenPayload);
      jest
        .spyOn(refreshTokenRepository, 'findOne')
        .mockResolvedValue(revokedToken);
      jest.spyOn(refreshTokenRepository, 'update').mockResolvedValue({
        affected: 2,
        raw: [],
        generatedMaps: [],
      } as UpdateResult);

      try {
        await service.refreshTokens(refreshToken, 'access-token');
      } catch (_error) {
        // Expected to throw
      }

      // Verify only tokens with matching familyId are targeted
      expect(refreshTokenRepository.update).toHaveBeenCalledWith(
        { familyId: 'family-uuid-123', revoked: false },
        { revoked: true, revocationReason: RevocationReason.THEFT_DETECTED },
      );
    });

    it('should set revocationReason to theft_detected', async () => {
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

      const revokedToken = {
        id: 'token-uuid-123',
        token: hashedToken,
        userId: mockUser.id,
        familyId: 'family-uuid-123',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        revoked: true,
        revocationReason: RevocationReason.ROTATION,
        user: mockUser,
        createdAt: new Date(),
      } as RefreshToken;

      jest
        .spyOn(jwtService, 'verifyRefreshToken')
        .mockReturnValue(tokenPayload);
      jest
        .spyOn(refreshTokenRepository, 'findOne')
        .mockResolvedValue(revokedToken);
      jest.spyOn(refreshTokenRepository, 'update').mockResolvedValue({
        affected: 2,
        raw: [],
        generatedMaps: [],
      } as UpdateResult);

      try {
        await service.refreshTokens(refreshToken, 'access-token');
      } catch (_error) {
        // Expected to throw
      }

      expect(refreshTokenRepository.update).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          revocationReason: RevocationReason.THEFT_DETECTED,
        }),
      );
    });
  });

  describe('Security Logging (8.6)', () => {
    it('should log security alert with correct context when theft detected', async () => {
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

      const revokedToken = {
        id: 'token-uuid-123',
        token: hashedToken,
        userId: mockUser.id,
        familyId: 'family-uuid-123',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        revoked: true,
        revocationReason: RevocationReason.ROTATION,
        user: mockUser,
        createdAt: new Date(),
      } as RefreshToken;

      jest
        .spyOn(jwtService, 'verifyRefreshToken')
        .mockReturnValue(tokenPayload);
      jest
        .spyOn(refreshTokenRepository, 'findOne')
        .mockResolvedValue(revokedToken);
      jest.spyOn(refreshTokenRepository, 'update').mockResolvedValue({
        affected: 2,
        raw: [],
        generatedMaps: [],
      } as UpdateResult);

      // Spy on logger
      const loggerErrorSpy = jest.spyOn(service['logger'], 'error');

      try {
        await service.refreshTokens(
          refreshToken,
          'access-token',
          '192.168.1.1',
        );
      } catch (_error) {
        // Expected to throw
      }

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Token theft detected',
        expect.objectContaining({
          userId: mockUser.id,
          familyId: 'family-uuid-123',
          tokenId: 'token-uuid-123',
          originalRevocationReason: RevocationReason.ROTATION,
          ipAddress: '192.168.1.1',
          timestamp: expect.any(String),
        }),
      );
    });

    it('should include userId, familyId, tokenId, ipAddress in security alert', async () => {
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

      const revokedToken = {
        id: 'token-uuid-123',
        token: hashedToken,
        userId: mockUser.id,
        familyId: 'family-uuid-123',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        revoked: true,
        revocationReason: RevocationReason.LOGOUT,
        user: mockUser,
        createdAt: new Date(),
      } as RefreshToken;

      jest
        .spyOn(jwtService, 'verifyRefreshToken')
        .mockReturnValue(tokenPayload);
      jest
        .spyOn(refreshTokenRepository, 'findOne')
        .mockResolvedValue(revokedToken);
      jest.spyOn(refreshTokenRepository, 'update').mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      } as UpdateResult);

      const loggerErrorSpy = jest.spyOn(service['logger'], 'error');

      try {
        await service.refreshTokens(refreshToken, 'access-token', '10.0.0.1');
      } catch (_error) {
        // Expected to throw
      }

      const logCall = loggerErrorSpy.mock.calls[0];
      expect(logCall[1]).toHaveProperty('userId', mockUser.id);
      expect(logCall[1]).toHaveProperty('familyId', 'family-uuid-123');
      expect(logCall[1]).toHaveProperty('tokenId', 'token-uuid-123');
      expect(logCall[1]).toHaveProperty('ipAddress', '10.0.0.1');
    });

    it('should log family invalidation with tokensInvalidated count', async () => {
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

      const revokedToken = {
        id: 'token-uuid-123',
        token: hashedToken,
        userId: mockUser.id,
        familyId: 'family-uuid-123',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        revoked: true,
        revocationReason: RevocationReason.ROTATION,
        user: mockUser,
        createdAt: new Date(),
      } as RefreshToken;

      jest
        .spyOn(jwtService, 'verifyRefreshToken')
        .mockReturnValue(tokenPayload);
      jest
        .spyOn(refreshTokenRepository, 'findOne')
        .mockResolvedValue(revokedToken);
      jest.spyOn(refreshTokenRepository, 'update').mockResolvedValue({
        affected: 3,
        raw: [],
        generatedMaps: [],
      } as UpdateResult);

      const loggerWarnSpy = jest.spyOn(service['logger'], 'warn');

      try {
        await service.refreshTokens(refreshToken, 'access-token');
      } catch (_error) {
        // Expected to throw
      }

      expect(loggerWarnSpy).toHaveBeenCalledWith(
        'Token family invalidated due to theft detection',
        expect.objectContaining({
          familyId: 'family-uuid-123',
          tokensInvalidated: 3,
        }),
      );
    });
  });

  describe('Configuration Behavior (8.7)', () => {
    it('should respect THEFT_DETECTION_ENABLED=false setting', async () => {
      // Reconfigure to disable theft detection
      jest.spyOn(configService, 'get').mockReturnValue({
        enabled: false,
        invalidateFamily: true,
      });

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

      const revokedToken = {
        id: 'token-uuid-123',
        token: hashedToken,
        userId: mockUser.id,
        familyId: 'family-uuid-123',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        revoked: true,
        revocationReason: RevocationReason.ROTATION,
        user: mockUser,
        createdAt: new Date(),
      } as RefreshToken;

      jest
        .spyOn(jwtService, 'verifyRefreshToken')
        .mockReturnValue(tokenPayload);
      jest
        .spyOn(refreshTokenRepository, 'findOne')
        .mockResolvedValue(revokedToken);
      const updateSpy = jest.spyOn(refreshTokenRepository, 'update');
      const loggerErrorSpy = jest.spyOn(service['logger'], 'error');
      const loggerWarnSpy = jest.spyOn(service['logger'], 'warn');

      await expect(
        service.refreshTokens(refreshToken, 'access-token'),
      ).rejects.toThrow(UnauthorizedException);

      // Should NOT log or invalidate family
      expect(loggerErrorSpy).not.toHaveBeenCalled();
      expect(loggerWarnSpy).not.toHaveBeenCalled();
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('should respect THEFT_DETECTION_INVALIDATE_FAMILY=false setting', async () => {
      // Reconfigure to log only (not invalidate)
      jest.spyOn(configService, 'get').mockReturnValue({
        enabled: true,
        invalidateFamily: false,
      });

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

      const revokedToken = {
        id: 'token-uuid-123',
        token: hashedToken,
        userId: mockUser.id,
        familyId: 'family-uuid-123',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        revoked: true,
        revocationReason: RevocationReason.ROTATION,
        user: mockUser,
        createdAt: new Date(),
      } as RefreshToken;

      jest
        .spyOn(jwtService, 'verifyRefreshToken')
        .mockReturnValue(tokenPayload);
      jest
        .spyOn(refreshTokenRepository, 'findOne')
        .mockResolvedValue(revokedToken);
      const updateSpy = jest.spyOn(refreshTokenRepository, 'update');
      const loggerErrorSpy = jest.spyOn(service['logger'], 'error');
      const loggerWarnSpy = jest.spyOn(service['logger'], 'warn');

      await expect(
        service.refreshTokens(refreshToken, 'access-token'),
      ).rejects.toThrow(UnauthorizedException);

      // Should log but NOT invalidate family
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Token theft detected',
        expect.any(Object),
      );
      expect(loggerWarnSpy).not.toHaveBeenCalled();
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('should have theft detection enabled by default', async () => {
      // Use default config
      jest.spyOn(configService, 'get').mockReturnValue({
        enabled: true,
        invalidateFamily: true,
      });

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

      const revokedToken = {
        id: 'token-uuid-123',
        token: hashedToken,
        userId: mockUser.id,
        familyId: 'family-uuid-123',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        revoked: true,
        revocationReason: RevocationReason.ROTATION,
        user: mockUser,
        createdAt: new Date(),
      } as RefreshToken;

      jest
        .spyOn(jwtService, 'verifyRefreshToken')
        .mockReturnValue(tokenPayload);
      jest
        .spyOn(refreshTokenRepository, 'findOne')
        .mockResolvedValue(revokedToken);
      jest.spyOn(refreshTokenRepository, 'update').mockResolvedValue({
        affected: 2,
        raw: [],
        generatedMaps: [],
      } as UpdateResult);
      const loggerErrorSpy = jest.spyOn(service['logger'], 'error');

      try {
        await service.refreshTokens(refreshToken, 'access-token');
      } catch (_error) {
        // Expected to throw
      }

      // Should log and invalidate
      expect(loggerErrorSpy).toHaveBeenCalled();
      expect(refreshTokenRepository.update).toHaveBeenCalled();
    });
  });
});
