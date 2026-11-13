import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from './jwt.service';
import { deriveTokenKey, JWT_SECRET_SAMPLE_VALUE } from '../utils/jwt-keys';

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
                JWT_SECRET: 'test-secret-at-least-32-characters-long',
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
          type: 'access',
        },
        expect.objectContaining({ expiresIn: '15m', algorithm: 'HS256' }),
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
          type: 'access',
        },
        expect.objectContaining({ expiresIn: '15m', algorithm: 'HS256' }),
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
          type: 'refresh',
        },
        expect.objectContaining({ expiresIn: '7d', algorithm: 'HS256' }),
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
        type: 'refresh',
        iat: 1234567890,
        exp: 1235172690,
      };

      jest.spyOn(nestJwtService, 'verify').mockReturnValue(expectedPayload);

      const payload = service.verifyRefreshToken(token);

      expect(payload).toEqual(expectedPayload);
      expect(nestJwtService.verify).toHaveBeenCalledWith(
        token,
        expect.objectContaining({ algorithms: ['HS256'] }),
      );
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

    it.each([['access'], ['totp_temp'], [undefined]])(
      'should reject a token of type %s',
      (type) => {
        jest
          .spyOn(nestJwtService, 'verify')
          .mockReturnValue({ sub: 'user-123', tokenId: 'token-456', type });

        expect(() => service.verifyRefreshToken('token')).toThrow(
          UnauthorizedException,
        );
      },
    );
  });

  describe('verifyAccessTokenIgnoreExpiration', () => {
    it('should verify and return valid access token payload ignoring expiration', () => {
      const token = 'expired-access-token';
      const expectedPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        authProvider: 'local',
        organizationId: 'org-456',
        type: 'access',
        iat: 1234567890,
        exp: 1234568790, // Expired
      };

      jest.spyOn(nestJwtService, 'verify').mockReturnValue(expectedPayload);

      const payload = service.verifyAccessTokenIgnoreExpiration(token);

      expect(payload).toEqual(expectedPayload);
      expect(nestJwtService.verify).toHaveBeenCalledWith(
        token,
        expect.objectContaining({
          ignoreExpiration: true,
          algorithms: ['HS256'],
        }),
      );
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

    it.each([['refresh'], ['totp_temp'], [undefined]])(
      'should reject a token of type %s',
      (type) => {
        jest
          .spyOn(nestJwtService, 'verify')
          .mockReturnValue({ sub: 'user-123', type });

        expect(() =>
          service.verifyAccessTokenIgnoreExpiration('token'),
        ).toThrow(UnauthorizedException);
      },
    );
  });

  describe('token type separation with real signing', () => {
    let realService: JwtService;

    beforeEach(() => {
      realService = new JwtService(new NestJwtService(), configService);
    });

    it('should not accept a TOTP temp token as a refresh token', () => {
      const tempToken = realService.generateTempToken('user-123', 'a@b.c');

      expect(() => realService.verifyRefreshToken(tempToken)).toThrow(
        UnauthorizedException,
      );
    });

    it('should not accept an access token as a refresh token', () => {
      const accessToken = realService.generateAccessToken(
        'user-123',
        'a@b.c',
        'user',
        'local',
      );

      expect(() => realService.verifyRefreshToken(accessToken)).toThrow(
        UnauthorizedException,
      );
    });

    it('should not accept a refresh or temp token where an access token is expected', () => {
      const refreshToken = realService.generateRefreshToken('user-123', 'rt');
      const tempToken = realService.generateTempToken('user-123', 'a@b.c');

      expect(() =>
        realService.verifyAccessTokenIgnoreExpiration(refreshToken),
      ).toThrow(UnauthorizedException);
      expect(() =>
        realService.verifyAccessTokenIgnoreExpiration(tempToken),
      ).toThrow(UnauthorizedException);
    });

    it('should not accept an access or refresh token as a TOTP temp token', () => {
      const accessToken = realService.generateAccessToken(
        'user-123',
        'a@b.c',
        'user',
        'local',
      );
      const refreshToken = realService.generateRefreshToken('user-123', 'rt');

      expect(() => realService.verifyTempToken(accessToken)).toThrow(
        UnauthorizedException,
      );
      expect(() => realService.verifyTempToken(refreshToken)).toThrow(
        UnauthorizedException,
      );
    });

    it('should accept each token type where that type is expected', () => {
      const accessToken = realService.generateAccessToken(
        'user-123',
        'a@b.c',
        'user',
        'local',
      );
      const refreshToken = realService.generateRefreshToken('user-123', 'rt');
      const tempToken = realService.generateTempToken('user-123', 'a@b.c');

      expect(
        realService.verifyAccessTokenIgnoreExpiration(accessToken),
      ).toMatchObject({ sub: 'user-123', type: 'access' });
      expect(realService.verifyRefreshToken(refreshToken)).toMatchObject({
        sub: 'user-123',
        tokenId: 'rt',
        type: 'refresh',
      });
      expect(realService.verifyTempToken(tempToken)).toEqual({
        sub: 'user-123',
        email: 'a@b.c',
      });
    });

    it('should reject a token with the right type claim but signed with another type key', () => {
      const forged = new NestJwtService().sign(
        { sub: 'user-123', tokenId: 'rt', type: 'refresh' },
        {
          secret: deriveTokenKey(
            'test-secret-at-least-32-characters-long',
            'access',
          ),
        },
      );

      expect(() => realService.verifyRefreshToken(forged)).toThrow(
        'Invalid or expired refresh token',
      );
    });

    it('should reject tokens signed directly with JWT_SECRET, as issued before per-type keys', () => {
      const legacySigner = new NestJwtService({
        secret: 'test-secret-at-least-32-characters-long',
      });
      const legacyAccess = legacySigner.sign({
        sub: 'user-123',
        type: 'access',
      });
      const legacyRefresh = legacySigner.sign({
        sub: 'user-123',
        tokenId: 'rt',
        type: 'refresh',
      });

      expect(() =>
        realService.verifyAccessTokenIgnoreExpiration(legacyAccess),
      ).toThrow('Invalid access token');
      expect(() => realService.verifyRefreshToken(legacyRefresh)).toThrow(
        'Invalid or expired refresh token',
      );
    });

    it('should reject a token signed with the right key but a different algorithm', () => {
      const hs512 = new NestJwtService().sign(
        { sub: 'user-123', type: 'access' },
        {
          secret: deriveTokenKey(
            'test-secret-at-least-32-characters-long',
            'access',
          ),
          algorithm: 'HS512',
        },
      );

      expect(() =>
        realService.verifyAccessTokenIgnoreExpiration(hs512),
      ).toThrow('Invalid access token');
    });
  });

  describe('JWT_SECRET handling at startup', () => {
    const configWith = (secret: string | undefined) =>
      ({
        get: jest.fn((key: string, defaultValue?: string) =>
          key === 'JWT_SECRET' ? secret : defaultValue,
        ),
      }) as unknown as ConfigService;

    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
      errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
    });

    afterEach(() => {
      errorSpy.mockRestore();
    });

    it('should refuse to start without JWT_SECRET', () => {
      expect(
        () => new JwtService(new NestJwtService(), configWith(undefined)),
      ).toThrow('JWT_SECRET is not configured');
    });

    it.each([
      ['the .env.sample value', JWT_SECRET_SAMPLE_VALUE],
      ['a short secret', 'too-short'],
    ])('should log an error when JWT_SECRET is %s', (_label, secret) => {
      new JwtService(new NestJwtService(), configWith(secret));

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('JWT_SECRET'),
      );
    });

    it('should not log an error for a strong JWT_SECRET', () => {
      new JwtService(new NestJwtService(), configWith('x'.repeat(48)));

      expect(errorSpy).not.toHaveBeenCalled();
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
