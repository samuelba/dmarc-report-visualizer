import { NestExpressApplication } from '@nestjs/platform-express';

export type TrustProxySetting = number | string | false;

const DEFAULT_HOPS = 1;

/**
 * Parse TRUST_PROXY into a value for Express' `trust proxy` setting.
 *
 * Accepts a hop count, `false`, or an Express address/subnet list.
 * `true` is rejected because it trusts any client-supplied X-Forwarded-For.
 */
export function parseTrustProxy(raw: string | undefined): TrustProxySetting {
  const value = raw?.trim() ?? '';
  if (value === '') {
    return DEFAULT_HOPS;
  }

  const lower = value.toLowerCase();
  if (lower === 'true') {
    throw new Error(
      'TRUST_PROXY=true trusts any client-supplied X-Forwarded-For header, which lets clients bypass login rate limiting. Set the number of reverse proxies in front of the backend instead (1 for the bundled nginx).',
    );
  }
  if (lower === 'false') {
    return false;
  }
  if (/^\d+$/.test(value)) {
    const hops = Number(value);
    return hops === 0 ? false : hops;
  }
  return value;
}

export function applyTrustProxy(
  app: NestExpressApplication,
  raw: string | undefined = process.env.TRUST_PROXY,
): void {
  app.set('trust proxy', parseTrustProxy(raw));
}
