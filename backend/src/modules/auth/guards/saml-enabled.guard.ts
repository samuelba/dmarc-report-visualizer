import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { SamlService } from '../services/saml.service';

/**
 * Guard to ensure SAML authentication is configured and enabled
 * Returns 403 if SAML is not configured or disabled
 */
@Injectable()
export class SamlEnabledGuard implements CanActivate {
  constructor(private readonly samlService: SamlService) {}

  async canActivate(_context: ExecutionContext): Promise<boolean> {
    const config = await this.samlService.getConfig();

    if (!config) {
      throw new ForbiddenException('SAML authentication is not configured');
    }

    if (!config.enabled) {
      throw new ForbiddenException('SAML authentication is not enabled');
    }

    return true;
  }
}
