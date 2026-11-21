import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SameOriginGuard } from './same-origin.guard';

function contextWith(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('SameOriginGuard', () => {
  afterEach(() => {
    delete process.env.CORS_ORIGINS;
  });

  it.each([
    ['same-origin', { 'sec-fetch-site': 'same-origin' }],
    ['a direct navigation', { 'sec-fetch-site': 'none' }],
    ['a non-browser client', {}],
  ])('allows %s', (_label, headers) => {
    expect(new SameOriginGuard().canActivate(contextWith(headers))).toBe(true);
  });

  it.each(['same-site', 'cross-site'])(
    'rejects a %s browser request',
    (site) => {
      expect(() =>
        new SameOriginGuard().canActivate(
          contextWith({
            'sec-fetch-site': site,
            origin: 'https://dmarc.example.com',
          }),
        ),
      ).toThrow(ForbiddenException);
    },
  );

  describe('browsers without Sec-Fetch-Site', () => {
    it('allows a configured origin', () => {
      process.env.CORS_ORIGINS = 'https://dmarc.example.com';

      expect(
        new SameOriginGuard().canActivate(
          contextWith({ origin: 'https://dmarc.example.com' }),
        ),
      ).toBe(true);
    });

    it('rejects another origin', () => {
      process.env.CORS_ORIGINS = 'https://dmarc.example.com';

      expect(() =>
        new SameOriginGuard().canActivate(
          contextWith({ origin: 'https://blog.example.com' }),
        ),
      ).toThrow(ForbiddenException);
    });
  });
});
