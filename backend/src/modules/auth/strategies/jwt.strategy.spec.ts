import { ConfigService } from '@nestjs/config';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { JwtStrategy } from './jwt.strategy';
import { JwtService } from '../services/jwt.service';
import { User } from '../entities/user.entity';
import { deriveTokenKey } from '../utils/jwt-keys';

const SECRET = 'test-secret-at-least-32-characters-long';

type AuthOutcome =
  | { kind: 'success'; user: { id: string } }
  | { kind: 'fail'; info: unknown }
  | { kind: 'error'; error: unknown };

describe('JwtStrategy', () => {
  const user = {
    id: 'user-1',
    email: 'user@example.com',
    role: 'administrator',
    authProvider: 'local',
    organizationId: null,
  } as unknown as User;

  let strategy: JwtStrategy;
  let jwtService: JwtService;
  let userRepository: { findOne: jest.Mock };

  beforeEach(() => {
    const configService = {
      get: jest.fn((key: string, defaultValue?: string) =>
        key === 'JWT_SECRET' ? SECRET : defaultValue,
      ),
    } as unknown as ConfigService;
    userRepository = { findOne: jest.fn().mockResolvedValue(user) };

    strategy = new JwtStrategy(
      configService,
      userRepository as unknown as Repository<User>,
    );
    jwtService = new JwtService(new NestJwtService(), configService);
  });

  const authenticateWithAccessCookie = (token: string): Promise<AuthOutcome> =>
    new Promise((resolve) => {
      const passportStrategy = strategy as unknown as {
        success: (user: { id: string }) => void;
        fail: (info: unknown) => void;
        error: (error: unknown) => void;
        authenticate: (req: unknown) => void;
      };
      passportStrategy.success = (authenticated) =>
        resolve({ kind: 'success', user: authenticated });
      passportStrategy.fail = (info) => resolve({ kind: 'fail', info });
      passportStrategy.error = (error) => resolve({ kind: 'error', error });
      passportStrategy.authenticate({ cookies: { accessToken: token } });
    });

  const signWith = (payload: object, key: Buffer | string) =>
    new NestJwtService().sign(payload, { secret: key });

  const invalidSignature = {
    kind: 'fail',
    info: expect.objectContaining({ message: 'invalid signature' }),
  };

  describe('validate', () => {
    it('returns the user for an access token payload', async () => {
      const result = await strategy.validate({
        sub: user.id,
        email: user.email,
        role: user.role,
        authProvider: user.authProvider,
        type: 'access',
      });

      expect(result).toEqual(
        expect.objectContaining({ id: user.id, role: user.role }),
      );
    });

    it.each([
      ['TOTP temp token', { type: 'totp_temp' }],
      ['refresh token', { type: 'refresh', tokenId: 'rt-1' }],
      ['token without a type', {}],
    ])('rejects a %s payload', async (_label, extra) => {
      const payload = { sub: user.id, email: user.email, ...extra };

      await expect(strategy.validate(payload as never)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(userRepository.findOne).not.toHaveBeenCalled();
    });
  });

  describe('authenticate with real signed tokens', () => {
    it('accepts an access token', async () => {
      const token = jwtService.generateAccessToken(
        user.id,
        user.email,
        user.role,
        user.authProvider,
      );

      const outcome = await authenticateWithAccessCookie(token);

      expect(outcome).toEqual({
        kind: 'success',
        user: expect.objectContaining({ id: user.id }),
      });
    });

    it('rejects the TOTP temp token issued before the second factor', async () => {
      const token = jwtService.generateTempToken(user.id, user.email);

      await expect(authenticateWithAccessCookie(token)).resolves.toEqual(
        invalidSignature,
      );
    });

    it('rejects a refresh token used as an access token', async () => {
      const token = jwtService.generateRefreshToken(user.id, 'rt-1');

      await expect(authenticateWithAccessCookie(token)).resolves.toEqual(
        invalidSignature,
      );
    });

    it('rejects a token claiming type access when signed with another type key', async () => {
      const token = signWith(
        { sub: user.id, type: 'access' },
        deriveTokenKey(SECRET, 'totp_temp'),
      );

      await expect(authenticateWithAccessCookie(token)).resolves.toEqual(
        invalidSignature,
      );
    });

    it('rejects an access token signed directly with JWT_SECRET, as issued before per-type keys', async () => {
      const token = signWith({ sub: user.id, type: 'access' }, SECRET);

      await expect(authenticateWithAccessCookie(token)).resolves.toEqual(
        invalidSignature,
      );
    });

    it('rejects a non-access token even when signed with the access key', async () => {
      const token = signWith(
        { sub: user.id, tokenId: 'rt-1', type: 'refresh' },
        deriveTokenKey(SECRET, 'access'),
      );

      const outcome = await authenticateWithAccessCookie(token);

      expect(outcome.kind).toBe('error');
      const { error } = outcome as { kind: 'error'; error: unknown };
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as Error).message).toBe('Invalid token type');
    });
  });
});
