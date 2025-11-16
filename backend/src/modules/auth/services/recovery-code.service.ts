import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { RecoveryCode } from '../entities/recovery-code.entity';
import {
  InvalidRecoveryCodeException,
  RecoveryCodeAlreadyUsedException,
} from '../exceptions/totp.exception';

@Injectable()
export class RecoveryCodeService {
  private readonly logger = new Logger(RecoveryCodeService.name);
  private readonly bcryptRounds = 10;

  constructor(
    @InjectRepository(RecoveryCode)
    private readonly recoveryCodeRepository: Repository<RecoveryCode>,
  ) {}

  /**
   * Generate 10 unique recovery codes in format XXXX-XXXX-XXXX-XXXX
   * Codes are hashed with bcrypt before storage
   * Returns the plain text codes (only time they're available)
   */
  async generateRecoveryCodes(userId: string): Promise<string[]> {
    const codes: string[] = [];
    const codeEntities: RecoveryCode[] = [];

    // Generate 10 unique codes
    for (let i = 0; i < 10; i++) {
      const code = this.generateCode();
      codes.push(code);

      // Hash the code before storage
      const codeHash = await bcrypt.hash(code, this.bcryptRounds);

      const recoveryCode = this.recoveryCodeRepository.create({
        userId,
        codeHash,
        used: false,
        usedAt: null,
      });

      codeEntities.push(recoveryCode);
    }

    // Save all codes to database
    await this.recoveryCodeRepository.save(codeEntities);

    // Audit log: Recovery codes generated
    this.logger.log({
      event: 'recovery_codes_generated',
      userId,
      count: codes.length,
      timestamp: new Date().toISOString(),
    });

    return codes;
  }

  /**
   * Validate a recovery code for a user
   * If valid and not used, marks the code as used
   * Throws exception if code is invalid or already used
   */
  async validateRecoveryCode(userId: string, code: string): Promise<boolean> {
    // Get all recovery codes for the user (including used ones to check if already used)
    const recoveryCodes = await this.recoveryCodeRepository.find({
      where: {
        userId,
      },
    });

    // Try to match the code against stored hashes
    for (const recoveryCode of recoveryCodes) {
      const isMatch = await bcrypt.compare(code, recoveryCode.codeHash);

      if (isMatch) {
        // Check if code was already used
        if (recoveryCode.used) {
          // Audit log: Attempt to reuse recovery code
          this.logger.warn({
            event: 'recovery_code_validation_failed',
            userId,
            codeId: recoveryCode.id,
            reason: 'already_used',
            timestamp: new Date().toISOString(),
          });

          throw new RecoveryCodeAlreadyUsedException();
        }

        // Mark the code as used
        recoveryCode.used = true;
        recoveryCode.usedAt = new Date();
        await this.recoveryCodeRepository.save(recoveryCode);

        // Audit log: Recovery code used successfully
        this.logger.log({
          event: 'recovery_code_used',
          userId,
          codeId: recoveryCode.id,
          timestamp: new Date().toISOString(),
        });

        return true;
      }
    }

    // No matching code found
    // Audit log: Invalid recovery code attempt
    this.logger.warn({
      event: 'recovery_code_validation_failed',
      userId,
      reason: 'invalid_code',
      timestamp: new Date().toISOString(),
    });

    throw new InvalidRecoveryCodeException();
  }

  /**
   * Invalidate all recovery codes for a user
   * Used when disabling TOTP or regenerating codes
   */
  async invalidateAllCodes(userId: string): Promise<void> {
    await this.recoveryCodeRepository.delete({ userId });
  }

  /**
   * Get count of remaining (unused) recovery codes for a user
   */
  async getRemainingCodesCount(userId: string): Promise<number> {
    return await this.recoveryCodeRepository.count({
      where: {
        userId,
        used: false,
      },
    });
  }

  /**
   * Generate a single recovery code in format XXXX-XXXX-XXXX-XXXX
   * Uses cryptographically secure random values
   */
  private generateCode(): string {
    const segments: string[] = [];

    for (let i = 0; i < 4; i++) {
      // Generate 4 random alphanumeric characters
      const segment = this.generateSegment();
      segments.push(segment);
    }

    return segments.join('-');
  }

  /**
   * Generate a 4-character alphanumeric segment
   * Uses uppercase letters and numbers for clarity
   */
  private generateSegment(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let segment = '';

    for (let i = 0; i < 4; i++) {
      // Securely generate a random index
      // crypto.randomInt(max) generates a number between 0 (inclusive)
      // and max (exclusive).
      const randomIndex = crypto.randomInt(chars.length);
      segment += chars[randomIndex];
    }

    return segment;
  }
}
