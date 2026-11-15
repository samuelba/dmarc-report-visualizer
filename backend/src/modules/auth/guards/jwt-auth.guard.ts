import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { API_TOKEN_AUTH_KEY } from '../decorators/api-token-auth.decorator';

/**
 * JWT Authentication Guard
 * Uses Passport JWT strategy to validate tokens and attach user to request
 * Allows public routes marked with @Public() decorator to bypass authentication
 * Routes marked with @ApiTokenAuth() are authenticated by ApiTokenGuard instead
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const usesApiToken = this.reflector.getAllAndOverride<boolean>(
      API_TOKEN_AUTH_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic || usesApiToken) {
      return true;
    }
    return super.canActivate(context);
  }
}
