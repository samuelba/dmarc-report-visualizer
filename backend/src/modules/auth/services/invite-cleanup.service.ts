import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InviteService } from './invite.service';

@Injectable()
export class InviteCleanupService {
  private readonly logger = new Logger(InviteCleanupService.name);

  constructor(private readonly inviteService: InviteService) {}

  @Cron('0 0 2 * * *') // Daily at 2 AM
  async cleanupExpiredInvites(): Promise<void> {
    this.logger.log('Starting invite cleanup job');

    try {
      await this.inviteService.cleanupExpiredInvites();

      this.logger.log('Invite cleanup completed successfully');
    } catch (error) {
      this.logger.error('Invite cleanup failed', error.stack);
    }
  }
}
