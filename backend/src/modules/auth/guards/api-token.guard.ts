import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  ApiTokenPrincipal,
  ApiTokenService,
} from '../services/api-token.service';
import { ApiTokenRateLimiterService } from '../services/api-token-rate-limiter.service';
import { ApiTokenScope } from '../enums/api-token-scope.enum';

export interface ApiTokenRequest extends Request {
  user?: ApiTokenPrincipal['user'];
  apiToken?: { id: string; scopes: ApiTokenScope[] };
}

const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

/**
 * Authenticates a request with `Authorization: Bearer <api token>` only.
 * Session cookies are never consulted. Apply it through @ApiTokenAuth().
 */
@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(
    private readonly apiTokenService: ApiTokenService,
    private readonly rateLimiter: ApiTokenRateLimiterService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<ApiTokenRequest>();
    const response = http.getResponse<Response>();
    const ip = request.ip || request.socket?.remoteAddress || 'unknown';

    const gate = this.rateLimiter.checkAuthAllowed(ip);
    if (!gate.allowed) {
      throw tooManyRequests(response, gate.retryAfter);
    }

    const rawToken = BEARER_PATTERN.exec(
      request.headers.authorization ?? '',
    )?.[1];
    if (!rawToken) {
      response.setHeader('WWW-Authenticate', 'Bearer');
      throw new UnauthorizedException('API token required');
    }

    const result = await this.apiTokenService.authenticate(rawToken, ip);
    if (!result.ok) {
      this.rateLimiter.recordAuthFailure(ip);
      response.setHeader('WWW-Authenticate', 'Bearer error="invalid_token"');
      throw new UnauthorizedException('Invalid API token');
    }

    // Per user, so creating more tokens does not raise the limit.
    const quota = this.rateLimiter.consumeRequest(result.principal.user.id);
    if (!quota.allowed) {
      throw tooManyRequests(response, quota.retryAfter);
    }

    request.user = result.principal.user;
    request.apiToken = {
      id: result.principal.tokenId,
      scopes: result.principal.scopes,
    };
    return true;
  }
}

function tooManyRequests(
  response: Response,
  retryAfter: number | undefined,
): HttpException {
  if (retryAfter) {
    response.setHeader('Retry-After', String(retryAfter));
  }
  return new HttpException(
    {
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      message: 'Too many requests. Please try again later.',
      retryAfter,
      error: 'Too Many Requests',
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
