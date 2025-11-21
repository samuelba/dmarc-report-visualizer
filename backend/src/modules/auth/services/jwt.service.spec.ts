import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from './jwt.service';

describe('JwtService', () => {
  let service: JwtService;
  let nestJwtService: NestJwtService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtService,
        {
          provide: NestJwtService,
          useValue: {
            sign: jest.fn(),
            verify: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              const config = {
                JWT_ACCESS_EXPIRATION: '15m',
                JWT_REFRESH_EXPIRATION: '7d',
                JWT_SECRET: 'test-secret',
              };
              return config[key] || defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<JwtService>(JwtService);
    nestJwtService = module.get<NestJwtService>(NestJwtService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateAccessToken', () => {
    it('should generate access token with correct payload', () => {
      const userId = 'user-123';
      const email = 'test@example.com';
      const role = 'user';
      const authProvider = 'local';
      const organizationId = 'org-456';
      const expectedToken = 'access-token-string';

      jest.spyOn(nestJwtService, 'sign').mockReturnValue(expectedToken);

      const token = service.generateAccessToken(
        userId,
        email,
        role,
        authProvider,
        organizationId,
      );

      expect(token).toBe(expectedToken);
      expect(nestJwtService.sign).toHaveBeenCalledWith(
        {
          sub: userId,
          email,
          role,
          authProvider,
          organizationId,
        },
        { expiresIn: '15m' },
      );
    });

    it('should generate access token without organizationId', () => {
      const userId = 'user-123';
      const email = 'test@example.com';
      const role = 'user';
      const authProvider = 'local';
      const expectedToken = 'access-token-string';

      jest.spyOn(nestJwtService, 'sign').mockReturnValue(expectedToken);

      const token = service.generateAccessToken(
        userId,
        email,
        role,
        authProvider,
      );

      expect(token).toBe(expectedToken);
      expect(nestJwtService.sign).toHaveBeenCalledWith(
        {
          sub: userId,
          email,
          role,
          authProvider,
          organizationId: undefined,
        },
        { expiresIn: '15m' },
      );
    });

    it('should use configured expiration time', () => {
      const userId = 'user-123';
      const email = 'test@example.com';
      const role = 'user';
      const authProvider = 'local';

      jest.spyOn(nestJwtService, 'sign').mockReturnValue('token');
      jest.spyOn(configService, 'get').mockReturnValue('30m');

      service.generateAccessToken(userId, email, role, authProvider);

      expect(configService.get).toHaveBeenCalledWith(
        'JWT_ACCESS_EXPIRATION',
        '15m',
      );
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate refresh token with correct payload', () => {
      const userId = 'user-123';
      const tokenId = 'token-456';
      const expectedToken = 'refresh-token-string';

      jest.spyOn(nestJwtService, 'sign').mockReturnValue(expectedToken);

      const token = service.generateRefreshToken(userId, tokenId);

      expect(token).toBe(expectedToken);
      expect(nestJwtService.sign).toHaveBeenCalledWith(
        {
          sub: userId,
          tokenId,
        },
        { expiresIn: '7d' },
      );
    });

    it('should use configured expiration time', () => {
      const userId = 'user-123';
      const tokenId = 'token-456';

      jest.spyOn(nestJwtService, 'sign').mockReturnValue('token');
      jest.spyOn(configService, 'get').mockReturnValue('14d');

      service.generateRefreshToken(userId, tokenId);

      expect(configService.get).toHaveBeenCalledWith(
        'JWT_REFRESH_EXPIRATION',
        '7d',
      );
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify and return valid refresh token payload', () => {
      const token = 'valid-refresh-token';
      const expectedPayload = {
        sub: 'user-123',
        tokenId: 'token-456',
        iat: 1234567890,
        exp: 1235172690,
      };

      jest.spyOn(nestJwtService, 'verify').mockReturnValue(expectedPayload);

      const payload = service.verifyRefreshToken(token);

      expect(payload).toEqual(expectedPayload);
      expect(nestJwtService.verify).toHaveBeenCalledWith(token);
    });

    it('should throw UnauthorizedException for invalid refresh token', () => {
      const token = 'invalid-refresh-token';

      jest.spyOn(nestJwtService, 'verify').mockImplementation(() => {
        throw new Error('Invalid token');
      });

      expect(() => service.verifyRefreshToken(token)).toThrow(
        UnauthorizedException,
      );
      expect(() => service.verifyRefreshToken(token)).toThrow(
        'Invalid or expired refresh token',
      );
    });

    it('should throw UnauthorizedException for expired refresh token', () => {
      const token = 'expired-refresh-token';

      jest.spyOn(nestJwtService, 'verify').mockImplementation(() => {
        throw new Error('Token expired');
      });

      expect(() => service.verifyRefreshToken(token)).toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('verifyAccessTokenIgnoreExpiration', () => {
    it('should verify and return valid access token payload ignoring expiration', () => {
      const token = 'expired-access-token';
      const expectedPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        authProvider: 'local',
        organizationId: 'org-456',
        iat: 1234567890,
        exp: 1234568790, // Expired
      };

      jest.spyOn(nestJwtService, 'verify').mockReturnValue(expectedPayload);

      const payload = service.verifyAccessTokenIgnoreExpiration(token);

      expect(payload).toEqual(expectedPayload);
      expect(nestJwtService.verify).toHaveBeenCalledWith(token, {
        ignoreExpiration: true,
      });
    });

    it('should throw UnauthorizedException for invalid access token signature', () => {
      const token = 'invalid-signature-token';

      jest.spyOn(nestJwtService, 'verify').mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      expect(() => service.verifyAccessTokenIgnoreExpiration(token)).toThrow(
        UnauthorizedException,
      );
      expect(() => service.verifyAccessTokenIgnoreExpiration(token)).toThrow(
        'Invalid access token',
      );
    });

    it('should throw UnauthorizedException for malformed access token', () => {
      const token = 'malformed-token';

      jest.spyOn(nestJwtService, 'verify').mockImplementation(() => {
        throw new Error('Malformed token');
      });

      expect(() => service.verifyAccessTokenIgnoreExpiration(token)).toThrow(
        UnauthorizedException,
      );
    });
  });

  /**
   * Property 6: JWT role inclusion
   * Feature: user-management, Property 6: JWT role inclusion
   * Validates: Requirements 6.3
   *
   * For any authenticated user, the generated access token should contain the user's role in the JWT payload
   */
  describe('Property 6: JWT role inclusion', () => {
    it('should include role in JWT payload for all users', async () => {
      const fc = await import('fast-check');

      fc.assert(
        fc.property(
          // Generate random user data
          fc.record({
            userId: fc.uuid(),
            email: fc.emailAddress(),
            role: fc.constantFrom('user', 'administrator'),
            authProvider: fc.constantFrom('local', 'saml'),
            organizationId: fc.option(fc.uuid(), { nil: null }),
          }),
          (userData) => {
            // Mock the sign method to capture the payload
            let capturedPayload: any;
            jest.spyOn(nestJwtService, 'sign').mockImplementation((payload) => {
              capturedPayload = payload;
              return 'mocked-token';
            });

            // Generate access token
            service.generateAccessToken(
              userData.userId,
              userData.email,
              userData.role,
              userData.authProvider,
              userData.organizationId,
            );

            // Verify the role is included in the payload
            expect(capturedPayload).toBeDefined();
            expect(capturedPayload.role).toBe(userData.role);
            expect(capturedPayload.sub).toBe(userData.userId);
            expect(capturedPayload.email).toBe(userData.email);
            expect(capturedPayload.authProvider).toBe(userData.authProvider);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
