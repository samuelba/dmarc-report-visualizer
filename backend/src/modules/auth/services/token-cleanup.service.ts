import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshToken } from '../entities/refresh-token.entity';

@Injectable()
export class TokenCleanupService {
  private readonly logger = new Logger(TokenCleanupService.name);

  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
  ) {}

  @Cron('0 0 1 * * *') // Daily at 1 AM
  async cleanupExpiredTokens(): Promise<void> {
    this.logger.log('Starting token cleanup job');

    try {
      const now = new Date();

      // Delete tokens that are expired OR revoked
      const result = await this.refreshTokenRepository
        .createQueryBuilder()
        .delete()
        .from(RefreshToken)
        .where('expires_at < :now', { now })
        .orWhere('revoked = :revoked', { revoked: true })
        .execute();

      const deletedCount = result.affected || 0;

      this.logger.log(
        `Token cleanup completed. Removed ${deletedCount} expired/revoked tokens`,
      );
    } catch (error) {
      this.logger.error('Token cleanup failed', error.stack);
    }
  }
}
