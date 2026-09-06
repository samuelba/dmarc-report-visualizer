/**
 * Redis is optional. It is only required for SAML replay protection and the
 * SMTP email queue. When REDIS_HOST is unset, those features stay disabled
 * and the app must not attempt a localhost:6379 connection.
 */
export function isRedisConfigured(
  host: string | undefined = process.env.REDIS_HOST,
): host is string {
  return typeof host === 'string' && host.trim().length > 0;
}
