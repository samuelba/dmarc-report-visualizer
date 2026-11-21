import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  API_TOKEN_PREFIX,
  ApiTokenService,
  MAX_ACTIVE_TOKENS_PER_USER,
} from './api-token.service';
import { ApiToken } from '../entities/api-token.entity';
import { ApiTokenScope } from '../enums/api-token-scope.enum';
import { UserRole } from '../enums/user-role.enum';
import { User } from '../entities/user.entity';

const NOW = new Date('2026-11-15T12:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

const VALID_TOKEN = `${API_TOKEN_PREFIX}${'a'.repeat(43)}`;

function makeToken(overrides: Partial<ApiToken> = {}): ApiToken {
  return {
    id: 'token-1',
    tokenHash: sha256(VALID_TOKEN),
    name: 'laptop',
    prefix: `${API_TOKEN_PREFIX}aaaaaa`,
    scopes: [ApiTokenScope.MCP_READ],
    userId: 'user-1',
    user: {
      id: 'user-1',
      email: 'alice@example.com',
      role: UserRole.USER,
      authProvider: 'local',
    } as User,
    expiresAt: new Date(NOW.getTime() + DAY_MS),
    lastUsedAt: null,
    lastUsedIp: null,
    revokedAt: null,
    createdAt: new Date(NOW.getTime() - DAY_MS),
    ...overrides,
  };
}

describe('ApiTokenService', () => {
  let service: ApiTokenService;
  const repo = {
    create: jest.fn((value: Partial<ApiToken>) => value),
    save: jest.fn((value: Partial<ApiToken>) =>
      Promise.resolve({ id: 'new-id', createdAt: NOW, ...value }),
    ),
    count: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env.API_TOKEN_MAX_TTL_DAYS;
    repo.count.mockResolvedValue(0);
    repo.update.mockResolvedValue({ affected: 1 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiTokenService,
        { provide: getRepositoryToken(ApiToken), useValue: repo },
      ],
    }).compile();

    service = module.get(ApiTokenService);
  });

  describe('create', () => {
    it('returns a recognisable token once and stores only its hash', async () => {
      const result = await service.create('user-1', { name: ' laptop ' }, NOW);

      expect(result.token).toMatch(/^dmarc_pat_[A-Za-z0-9_-]{43}$/);
      const stored = repo.save.mock.calls[0][0] as ApiToken;
      expect(stored.tokenHash).toBe(sha256(result.token));
      expect(JSON.stringify(stored)).not.toContain(result.token);
      expect(stored.prefix).toBe(result.token.slice(0, 16));
      expect(stored.name).toBe('laptop');
      expect(stored.userId).toBe('user-1');
      expect(result.apiToken).not.toHaveProperty('tokenHash');
    });

    it('generates a different token each time', async () => {
      const first = await service.create('user-1', { name: 'a' }, NOW);
      const second = await service.create('user-1', { name: 'b' }, NOW);

      expect(first.token).not.toBe(second.token);
    });

    it('defaults to 90 days and read-only scope', async () => {
      await service.create('user-1', { name: 'laptop' }, NOW);

      const stored = repo.save.mock.calls[0][0] as ApiToken;
      expect(stored.expiresAt.getTime()).toBe(NOW.getTime() + 90 * DAY_MS);
      expect(stored.scopes).toEqual([ApiTokenScope.MCP_READ]);
    });

    it('adds the raw XML scope only when asked', async () => {
      await service.create(
        'user-1',
        { name: 'laptop', allowRawXml: true },
        NOW,
      );

      const stored = repo.save.mock.calls[0][0] as ApiToken;
      expect(stored.scopes).toEqual([
        ApiTokenScope.MCP_READ,
        ApiTokenScope.MCP_RAW_XML,
      ]);
    });

    it('rejects an expiry beyond API_TOKEN_MAX_TTL_DAYS', async () => {
      process.env.API_TOKEN_MAX_TTL_DAYS = '30';
      const module = await Test.createTestingModule({
        providers: [
          ApiTokenService,
          { provide: getRepositoryToken(ApiToken), useValue: repo },
        ],
      }).compile();
      const limited = module.get(ApiTokenService);

      await expect(
        limited.create('user-1', { name: 'x', expiresInDays: 31 }, NOW),
      ).rejects.toThrow(BadRequestException);

      await limited.create('user-1', { name: 'x' }, NOW);
      const stored = repo.save.mock.calls[0][0] as ApiToken;
      expect(stored.expiresAt.getTime()).toBe(NOW.getTime() + 30 * DAY_MS);
    });

    it('caps the number of active tokens per user', async () => {
      repo.count.mockResolvedValue(MAX_ACTIVE_TOKENS_PER_USER);

      await expect(
        service.create('user-1', { name: 'x' }, NOW),
      ).rejects.toThrow(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('authenticate', () => {
    it('rejects malformed tokens without a database lookup', async () => {
      for (const raw of [
        '',
        'abc',
        `${API_TOKEN_PREFIX}short`,
        'x'.repeat(53),
      ]) {
        const result = await service.authenticate(raw, '1.2.3.4', NOW);
        expect(result).toEqual({ ok: false, reason: 'malformed' });
      }
      expect(repo.findOne).not.toHaveBeenCalled();
    });

    it('looks the token up by hash', async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.authenticate(VALID_TOKEN, '1.2.3.4', NOW);

      expect(result).toEqual({ ok: false, reason: 'unknown' });
      expect(repo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tokenHash: sha256(VALID_TOKEN) },
        }),
      );
    });

    it('rejects revoked tokens', async () => {
      repo.findOne.mockResolvedValue(makeToken({ revokedAt: NOW }));

      const result = await service.authenticate(VALID_TOKEN, '1.2.3.4', NOW);

      expect(result).toMatchObject({ ok: false, reason: 'revoked' });
    });

    it('rejects expired tokens, including at the exact expiry time', async () => {
      repo.findOne.mockResolvedValue(makeToken({ expiresAt: NOW }));

      const result = await service.authenticate(VALID_TOKEN, '1.2.3.4', NOW);

      expect(result).toMatchObject({ ok: false, reason: 'expired' });
    });

    it('rejects tokens whose user no longer exists', async () => {
      repo.findOne.mockResolvedValue(
        makeToken({ user: null as unknown as User }),
      );

      const result = await service.authenticate(VALID_TOKEN, '1.2.3.4', NOW);

      expect(result).toMatchObject({ ok: false, reason: 'unknown' });
    });

    it('returns the current user role from the database', async () => {
      repo.findOne.mockResolvedValue(
        makeToken({
          user: {
            id: 'user-1',
            email: 'alice@example.com',
            role: UserRole.ADMINISTRATOR,
            authProvider: 'saml',
          } as User,
        }),
      );

      const result = await service.authenticate(VALID_TOKEN, '1.2.3.4', NOW);

      expect(result).toEqual({
        ok: true,
        principal: {
          tokenId: 'token-1',
          scopes: [ApiTokenScope.MCP_READ],
          user: {
            id: 'user-1',
            email: 'alice@example.com',
            role: UserRole.ADMINISTRATOR,
            authProvider: 'saml',
          },
        },
      });
    });

    it('records last use, at most once per minute', async () => {
      repo.findOne.mockResolvedValue(makeToken());
      await service.authenticate(VALID_TOKEN, '1.2.3.4', NOW);
      expect(repo.update).toHaveBeenCalledWith('token-1', {
        lastUsedAt: NOW,
        lastUsedIp: '1.2.3.4',
      });

      repo.update.mockClear();
      repo.findOne.mockResolvedValue(
        makeToken({ lastUsedAt: new Date(NOW.getTime() - 30_000) }),
      );
      await service.authenticate(VALID_TOKEN, '1.2.3.4', NOW);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('still authenticates when recording last use fails', async () => {
      repo.findOne.mockResolvedValue(makeToken());
      repo.update.mockRejectedValue(new Error('db down'));

      const result = await service.authenticate(VALID_TOKEN, '1.2.3.4', NOW);

      expect(result.ok).toBe(true);
    });
  });

  describe('revoke', () => {
    it('revokes only tokens owned by the user', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.revokeOwn('user-2', 'token-1', NOW)).rejects.toThrow(
        NotFoundException,
      );
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: 'token-1', userId: 'user-2' },
      });
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('sets revokedAt on an active token', async () => {
      repo.findOne.mockResolvedValue(makeToken());

      const view = await service.revokeOwn('user-1', 'token-1', NOW);

      expect(repo.update).toHaveBeenCalledWith('token-1', { revokedAt: NOW });
      expect(view.revokedAt).toEqual(NOW);
    });

    it('keeps the original revokedAt when revoked twice', async () => {
      const earlier = new Date(NOW.getTime() - DAY_MS);
      repo.findOne.mockResolvedValue(makeToken({ revokedAt: earlier }));

      const view = await service.revokeOwn('user-1', 'token-1', NOW);

      expect(repo.update).not.toHaveBeenCalled();
      expect(view.revokedAt).toEqual(earlier);
    });

    it('lets an admin revoke any token by id', async () => {
      repo.findOne.mockResolvedValue(makeToken());

      await service.revokeAny('token-1', NOW);

      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'token-1' } });
      expect(repo.update).toHaveBeenCalledWith('token-1', { revokedAt: NOW });
    });

    it('revokes all active tokens of a user', async () => {
      repo.update.mockResolvedValue({ affected: 3 });

      const count = await service.revokeAllForUser('user-1', NOW);

      expect(count).toBe(3);
      expect(repo.update).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1' }),
        { revokedAt: NOW },
      );
    });
  });

  describe('list', () => {
    it('lists the user own tokens without hashes', async () => {
      repo.find.mockResolvedValue([makeToken()]);

      const views = await service.listForUser('user-1');

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } }),
      );
      expect(views[0]).not.toHaveProperty('tokenHash');
      expect(views[0]).not.toHaveProperty('user');
    });

    it('lists all tokens with owner email for admins', async () => {
      repo.find.mockResolvedValue([makeToken()]);

      const views = await service.listAll();

      expect(views[0]).toMatchObject({
        userId: 'user-1',
        userEmail: 'alice@example.com',
      });
      expect(views[0]).not.toHaveProperty('tokenHash');
    });
  });
});
