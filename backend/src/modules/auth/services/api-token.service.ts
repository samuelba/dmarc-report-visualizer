import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, IsNull, MoreThan, Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { ApiToken } from '../entities/api-token.entity';
import { ApiTokenScope } from '../enums/api-token-scope.enum';
import { UserRole } from '../enums/user-role.enum';
import { getApiTokenMaxTtlDays } from '../../../config/mcp.config';

export const API_TOKEN_PREFIX = 'dmarc_pat_';
export const MAX_ACTIVE_TOKENS_PER_USER = 25;
const DEFAULT_TTL_DAYS = 90;
const TOKEN_PATTERN = /^dmarc_pat_[A-Za-z0-9_-]{43}$/;
const DISPLAY_PREFIX_LENGTH = API_TOKEN_PREFIX.length + 6;
const LAST_USED_UPDATE_INTERVAL_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface CreateApiTokenInput {
  name: string;
  expiresInDays?: number;
  allowRawXml?: boolean;
}

export interface ApiTokenView {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiTokenScope[];
  createdAt: Date;
  expiresAt: Date;
  lastUsedAt: Date | null;
  lastUsedIp: string | null;
  revokedAt: Date | null;
}

export interface AdminApiTokenView extends ApiTokenView {
  userId: string;
  userEmail: string | null;
}

export interface ApiTokenPrincipal {
  tokenId: string;
  scopes: ApiTokenScope[];
  user: {
    id: string;
    email: string;
    role: UserRole;
    authProvider: string;
  };
}

export type ApiTokenFailureReason =
  'malformed' | 'unknown' | 'revoked' | 'expired';

export type ApiTokenAuthResult =
  | { ok: true; principal: ApiTokenPrincipal }
  | { ok: false; reason: ApiTokenFailureReason; tokenId?: string };

export function hashApiToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class ApiTokenService {
  private readonly logger = new Logger(ApiTokenService.name);
  private readonly maxTtlDays = getApiTokenMaxTtlDays();

  constructor(
    @InjectRepository(ApiToken)
    private readonly apiTokenRepository: Repository<ApiToken>,
  ) {}

  async create(
    userId: string,
    input: CreateApiTokenInput,
    now: Date = new Date(),
  ): Promise<{ token: string; apiToken: ApiTokenView }> {
    const ttlDays =
      input.expiresInDays ?? Math.min(DEFAULT_TTL_DAYS, this.maxTtlDays);
    if (ttlDays > this.maxTtlDays) {
      throw new BadRequestException(
        `API tokens can be valid for at most ${this.maxTtlDays} days`,
      );
    }

    const activeCount = await this.apiTokenRepository.count({
      where: { userId, revokedAt: IsNull(), expiresAt: MoreThan(now) },
    });
    if (activeCount >= MAX_ACTIVE_TOKENS_PER_USER) {
      throw new BadRequestException(
        `You can have at most ${MAX_ACTIVE_TOKENS_PER_USER} active API tokens. Revoke one first.`,
      );
    }

    const token = `${API_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
    const scopes = input.allowRawXml
      ? [ApiTokenScope.MCP_READ, ApiTokenScope.MCP_RAW_XML]
      : [ApiTokenScope.MCP_READ];

    const saved = await this.apiTokenRepository.save(
      this.apiTokenRepository.create({
        tokenHash: hashApiToken(token),
        name: input.name.trim(),
        prefix: token.slice(0, DISPLAY_PREFIX_LENGTH),
        scopes,
        userId,
        expiresAt: new Date(now.getTime() + ttlDays * DAY_MS),
        lastUsedAt: null,
        lastUsedIp: null,
        revokedAt: null,
      }),
    );

    this.logger.log('API token created', {
      event: 'api_token_created',
      tokenId: saved.id,
      userId,
      scopes,
      expiresAt: saved.expiresAt.toISOString(),
    });

    return { token, apiToken: toView(saved) };
  }

  async listForUser(userId: string): Promise<ApiTokenView[]> {
    const tokens = await this.apiTokenRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return tokens.map(toView);
  }

  async listAll(): Promise<AdminApiTokenView[]> {
    const tokens = await this.apiTokenRepository.find({
      relations: { user: true },
      order: { createdAt: 'DESC' },
    });
    return tokens.map((token) => ({
      ...toView(token),
      userId: token.userId,
      userEmail: token.user?.email ?? null,
    }));
  }

  revokeOwn(
    userId: string,
    tokenId: string,
    now: Date = new Date(),
  ): Promise<ApiTokenView> {
    return this.revoke({ id: tokenId, userId }, now);
  }

  revokeAny(tokenId: string, now: Date = new Date()): Promise<ApiTokenView> {
    return this.revoke({ id: tokenId }, now);
  }

  async revokeAllForUser(
    userId: string,
    now: Date = new Date(),
  ): Promise<number> {
    const result = await this.apiTokenRepository.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: now },
    );
    const revoked = result.affected ?? 0;
    this.logger.log('All API tokens of user revoked', {
      event: 'api_token_revoked_all',
      userId,
      revoked,
    });
    return revoked;
  }

  async authenticate(
    rawToken: string,
    ip: string,
    now: Date = new Date(),
  ): Promise<ApiTokenAuthResult> {
    if (!TOKEN_PATTERN.test(rawToken)) {
      return this.fail('malformed', ip);
    }

    const token = await this.apiTokenRepository.findOne({
      where: { tokenHash: hashApiToken(rawToken) },
      relations: { user: true },
    });
    if (!token || !token.user) {
      return this.fail('unknown', ip, token?.id);
    }
    if (token.revokedAt) {
      return this.fail('revoked', ip, token.id);
    }
    if (token.expiresAt.getTime() <= now.getTime()) {
      return this.fail('expired', ip, token.id);
    }

    await this.recordLastUse(token, ip, now);

    return {
      ok: true,
      principal: {
        tokenId: token.id,
        scopes: token.scopes,
        user: {
          id: token.user.id,
          email: token.user.email,
          role: token.user.role,
          authProvider: token.user.authProvider,
        },
      },
    };
  }

  private async revoke(
    where: FindOptionsWhere<ApiToken>,
    now: Date,
  ): Promise<ApiTokenView> {
    const token = await this.apiTokenRepository.findOne({ where });
    if (!token) {
      throw new NotFoundException('API token not found');
    }
    if (token.revokedAt) {
      return toView(token);
    }

    await this.apiTokenRepository.update(token.id, { revokedAt: now });
    this.logger.log('API token revoked', {
      event: 'api_token_revoked',
      tokenId: token.id,
      userId: token.userId,
    });
    return toView({ ...token, revokedAt: now });
  }

  private async recordLastUse(
    token: ApiToken,
    ip: string,
    now: Date,
  ): Promise<void> {
    const recentlyRecorded =
      token.lastUsedAt &&
      now.getTime() - token.lastUsedAt.getTime() < LAST_USED_UPDATE_INTERVAL_MS;
    if (recentlyRecorded) {
      return;
    }
    try {
      await this.apiTokenRepository.update(token.id, {
        lastUsedAt: now,
        lastUsedIp: ip,
      });
    } catch (error) {
      this.logger.warn('Could not record API token use', {
        event: 'api_token_last_use_failed',
        tokenId: token.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private fail(
    reason: ApiTokenFailureReason,
    ip: string,
    tokenId?: string,
  ): ApiTokenAuthResult {
    this.logger.warn('API token authentication failed', {
      event: 'api_token_auth_failed',
      reason,
      tokenId,
      ipAddress: ip,
    });
    return tokenId ? { ok: false, reason, tokenId } : { ok: false, reason };
  }
}

function toView(token: ApiToken): ApiTokenView {
  return {
    id: token.id,
    name: token.name,
    prefix: token.prefix,
    scopes: token.scopes,
    createdAt: token.createdAt,
    expiresAt: token.expiresAt,
    lastUsedAt: token.lastUsedAt,
    lastUsedIp: token.lastUsedIp,
    revokedAt: token.revokedAt,
  };
}
