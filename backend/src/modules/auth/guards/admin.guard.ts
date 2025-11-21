import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '../enums/user-role.enum';

/**
 * Guard that ensures the user has administrator role
 * Requires JwtAuthGuard to be applied first to populate request.user
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || user.role !== UserRole.ADMINISTRATOR) {
      throw new ForbiddenException('Administrator access required');
    }

    return true;
  }
}
