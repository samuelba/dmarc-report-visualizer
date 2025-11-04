import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { AuthService } from '../services/auth.service';

@Injectable()
export class SetupGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(_context: ExecutionContext): Promise<boolean> {
    // Check if setup is needed (no users exist)
    const needsSetup = await this.authService.needsSetup();

    if (!needsSetup) {
      throw new ForbiddenException('Setup has already been completed');
    }

    return true;
  }
}
