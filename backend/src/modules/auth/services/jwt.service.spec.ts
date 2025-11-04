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
      const organizationId = 'org-456';
      const expectedToken = 'access-token-string';

      jest.spyOn(nestJwtService, 'sign').mockReturnValue(expectedToken);

      const token = service.generateAccessToken(userId, email, organizationId);

      expect(token).toBe(expectedToken);
      expect(nestJwtService.sign).toHaveBeenCalledWith(
        {
          sub: userId,
          email,
          organizationId,
        },
        { expiresIn: '15m' },
      );
    });

    it('should generate access token without organizationId', () => {
      const userId = 'user-123';
      const email = 'test@example.com';
      const expectedToken = 'access-token-string';

      jest.spyOn(nestJwtService, 'sign').mockReturnValue(expectedToken);

      const token = service.generateAccessToken(userId, email);

      expect(token).toBe(expectedToken);
      expect(nestJwtService.sign).toHaveBeenCalledWith(
        {
          sub: userId,
          email,
          organizationId: undefined,
        },
        { expiresIn: '15m' },
      );
    });

    it('should use configured expiration time', () => {
      const userId = 'user-123';
      const email = 'test@example.com';

      jest.spyOn(nestJwtService, 'sign').mockReturnValue('token');
      jest.spyOn(configService, 'get').mockReturnValue('30m');

      service.generateAccessToken(userId, email);

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

  describe('verifyAccessToken', () => {
    it('should verify and return valid access token payload', () => {
      const token = 'valid-access-token';
      const expectedPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        organizationId: 'org-456',
        iat: 1234567890,
        exp: 1234568790,
      };

      jest.spyOn(nestJwtService, 'verify').mockReturnValue(expectedPayload);

      const payload = service.verifyAccessToken(token);

      expect(payload).toEqual(expectedPayload);
      expect(nestJwtService.verify).toHaveBeenCalledWith(token);
    });

    it('should throw UnauthorizedException for invalid token', () => {
      const token = 'invalid-token';

      jest.spyOn(nestJwtService, 'verify').mockImplementation(() => {
        throw new Error('Invalid token');
      });

      expect(() => service.verifyAccessToken(token)).toThrow(
        UnauthorizedException,
      );
      expect(() => service.verifyAccessToken(token)).toThrow(
        'Invalid or expired access token',
      );
    });

    it('should throw UnauthorizedException for expired token', () => {
      const token = 'expired-token';

      jest.spyOn(nestJwtService, 'verify').mockImplementation(() => {
        throw new Error('Token expired');
      });

      expect(() => service.verifyAccessToken(token)).toThrow(
        UnauthorizedException,
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
});
