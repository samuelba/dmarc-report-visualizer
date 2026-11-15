type Env = Record<string, string | undefined>;

const DEFAULT_API_TOKEN_MAX_TTL_DAYS = 365;
const MAX_API_TOKEN_TTL_DAYS = 3650;
const DEFAULT_MCP_RATE_LIMIT_PER_MIN = 60;
const MAX_MCP_RATE_LIMIT_PER_MIN = 100000;

/**
 * The MCP server and API tokens exist only when MCP_ENABLED is "true".
 * Anything else, including unset, keeps the whole feature out of the app.
 */
export function isMcpEnabled(env: Env = process.env): boolean {
  return env.MCP_ENABLED?.trim().toLowerCase() === 'true';
}

export function getApiTokenMaxTtlDays(env: Env = process.env): number {
  return parseBoundedInt(
    'API_TOKEN_MAX_TTL_DAYS',
    env.API_TOKEN_MAX_TTL_DAYS,
    DEFAULT_API_TOKEN_MAX_TTL_DAYS,
    MAX_API_TOKEN_TTL_DAYS,
  );
}

export function getMcpRateLimitPerMinute(env: Env = process.env): number {
  return parseBoundedInt(
    'MCP_RATE_LIMIT_PER_MIN',
    env.MCP_RATE_LIMIT_PER_MIN,
    DEFAULT_MCP_RATE_LIMIT_PER_MIN,
    MAX_MCP_RATE_LIMIT_PER_MIN,
  );
}

function parseBoundedInt(
  name: string,
  raw: string | undefined,
  fallback: number,
  max: number,
): number {
  const value = raw?.trim() ?? '';
  if (value === '') {
    return fallback;
  }
  const parsed = /^\d+$/.test(value) ? Number(value) : NaN;
  if (!(parsed >= 1 && parsed <= max)) {
    throw new Error(`${name} must be a whole number between 1 and ${max}`);
  }
  return parsed;
}
