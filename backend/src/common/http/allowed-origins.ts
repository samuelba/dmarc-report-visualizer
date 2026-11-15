type Env = Record<string, string | undefined>;

/**
 * Browser origins allowed to call the MCP endpoint (DNS-rebinding defence).
 * Non-browser MCP clients send no Origin header and are not affected.
 */
export function parseAllowedOrigins(env: Env = process.env): string[] {
  return [env.CORS_ORIGINS, env.MCP_ALLOWED_ORIGINS]
    .flatMap((value) => (value ?? '').split(','))
    .map((origin) => normalize(origin.trim()))
    .filter((origin) => origin !== '' && origin !== '*');
}

export function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: string[],
): boolean {
  if (origin === undefined) {
    return true;
  }
  return allowedOrigins.includes(normalize(origin));
}

function normalize(origin: string): string {
  return origin.replace(/\/+$/, '');
}
