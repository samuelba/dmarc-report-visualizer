import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import {
  isOriginAllowed,
  parseAllowedOrigins,
} from '../../../common/http/allowed-origins';

const ALLOWED_FETCH_SITES = new Set(['same-origin', 'none']);

/**
 * Lets browsers call a cookie-authenticated route only from the app's own
 * origin. SameSite cookies stop cross-site requests but not same-site ones
 * (e.g. a sibling subdomain), and a permissive CORS_ORIGINS would let such a
 * page read the response, which for token creation is a long-lived secret.
 *
 * Uses Sec-Fetch-Site, which browsers attach to every request; older browsers
 * fall back to the Origin header and the configured allowlist.
 */
@Injectable()
export class SameOriginGuard implements CanActivate {
  private readonly allowedOrigins = parseAllowedOrigins();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const site = request.headers['sec-fetch-site'];

    if (typeof site === 'string') {
      if (ALLOWED_FETCH_SITES.has(site)) {
        return true;
      }
      throw new ForbiddenException('Cross-origin requests are not allowed');
    }

    const origin = request.headers.origin;
    if (
      origin === undefined ||
      this.allowedOrigins.length === 0 ||
      isOriginAllowed(origin, this.allowedOrigins)
    ) {
      return true;
    }
    throw new ForbiddenException('Cross-origin requests are not allowed');
  }
}
