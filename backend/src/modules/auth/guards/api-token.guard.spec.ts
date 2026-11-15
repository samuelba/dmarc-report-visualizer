import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTokenGuard, ApiTokenRequest } from './api-token.guard';
import { ApiTokenService } from '../services/api-token.service';
import { ApiTokenRateLimiterService } from '../services/api-token-rate-limiter.service';
import { ApiTokenScope } from '../enums/api-token-scope.enum';
import { UserRole } from '../enums/user-role.enum';

const VALID = `dmarc_pat_${'a'.repeat(43)}`;

const principal = {
  tokenId: 'token-1',
  scopes: [ApiTokenScope.MCP_READ],
  user: {
    id: 'user-1',
    email: 'alice@example.com',
    role: UserRole.USER,
    authProvider: 'local',
  },
};

function makeContext(headers: Record<string, string>, cookies = {}) {
  const request = {
    headers,
    cookies,
    ip: '1.2.3.4',
    socket: {},
  } as unknown as ApiTokenRequest;
  const response = { setHeader: jest.fn() };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  return { context, request, response };
}

async function expectStatus(promise: Promise<unknown>, status: number) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(HttpException);
  expect((error as HttpException).getStatus()).toBe(status);
}

describe('ApiTokenGuard', () => {
  let service: { authenticate: jest.Mock };
  let limiter: {
    checkAuthAllowed: jest.Mock;
    recordAuthFailure: jest.Mock;
    consumeRequest: jest.Mock;
  };
  let guard: ApiTokenGuard;

  beforeEach(() => {
    service = { authenticate: jest.fn() };
    limiter = {
      checkAuthAllowed: jest.fn().mockReturnValue({ allowed: true }),
      recordAuthFailure: jest.fn(),
      consumeRequest: jest.fn().mockReturnValue({ allowed: true }),
    };
    guard = new ApiTokenGuard(
      service as unknown as ApiTokenService,
      limiter as unknown as ApiTokenRateLimiterService,
    );
  });

  it.each([
    ['no header', {}],
    ['a non-Bearer scheme', { authorization: `Basic ${VALID}` }],
    ['an empty Bearer value', { authorization: 'Bearer ' }],
  ])('rejects %s without counting a failure', async (_label, headers) => {
    const { context, response } = makeContext(headers);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Bearer',
    );
    expect(service.authenticate).not.toHaveBeenCalled();
    expect(limiter.recordAuthFailure).not.toHaveBeenCalled();
  });

  it('ignores the session cookie', async () => {
    const { context } = makeContext({}, { accessToken: 'jwt' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(service.authenticate).not.toHaveBeenCalled();
  });

  it('rejects an invalid token and counts the failure', async () => {
    service.authenticate.mockResolvedValue({ ok: false, reason: 'revoked' });
    const { context, response } = makeContext({
      authorization: `Bearer ${VALID}`,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      'Invalid API token',
    );
    expect(limiter.recordAuthFailure).toHaveBeenCalledWith('1.2.3.4');
    expect(response.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Bearer error="invalid_token"',
    );
  });

  it('blocks a locked IP before looking up the token', async () => {
    limiter.checkAuthAllowed.mockReturnValue({
      allowed: false,
      retryAfter: 900,
    });
    const { context, response } = makeContext({
      authorization: `Bearer ${VALID}`,
    });

    await expectStatus(
      guard.canActivate(context),
      HttpStatus.TOO_MANY_REQUESTS,
    );
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '900');
    expect(service.authenticate).not.toHaveBeenCalled();
  });

  it('accepts a valid token and attaches the principal', async () => {
    service.authenticate.mockResolvedValue({ ok: true, principal });
    const { context, request } = makeContext({
      authorization: `bearer ${VALID}`,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(service.authenticate).toHaveBeenCalledWith(VALID, '1.2.3.4');
    expect(limiter.consumeRequest).toHaveBeenCalledWith('token-1');
    expect(request.user).toEqual(principal.user);
    expect(request.apiToken).toEqual({
      id: 'token-1',
      scopes: [ApiTokenScope.MCP_READ],
    });
  });

  it('enforces the per-token request quota', async () => {
    service.authenticate.mockResolvedValue({ ok: true, principal });
    limiter.consumeRequest.mockReturnValue({ allowed: false, retryAfter: 12 });
    const { context, request, response } = makeContext({
      authorization: `Bearer ${VALID}`,
    });

    await expectStatus(
      guard.canActivate(context),
      HttpStatus.TOO_MANY_REQUESTS,
    );
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '12');
    expect(request.user).toBeUndefined();
  });
});
