import {
  Injectable,
  BadRequestException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { SmtpConfig } from '../entities/smtp-config.entity';
import { SmtpConfigDto } from '../dto/smtp-config.dto';
import { VersionedCipher } from '../../../common/crypto/versioned-cipher';
import {
  createSmtpCipher,
  findSmtpKeyWeakness,
  prepareStoredSmtpPassword,
  SMTP_PASSWORD_UNREADABLE_HINT,
} from '../utils/smtp-encryption';

@Injectable()
export class SmtpConfigService implements OnModuleInit {
  private readonly logger = new Logger(SmtpConfigService.name);
  private readonly SINGLETON_ID = 1;
  private readonly cipher: VersionedCipher;

  constructor(
    @InjectRepository(SmtpConfig)
    private readonly smtpConfigRepository: Repository<SmtpConfig>,
    private readonly configService: ConfigService,
  ) {
    const key = this.configService.get<string>('SMTP_ENCRYPTION_KEY');
    if (!key) {
      throw new Error('SMTP_ENCRYPTION_KEY environment variable is required');
    }

    const weakness = findSmtpKeyWeakness(key);
    if (weakness) {
      this.logger.warn(
        `${weakness} Generate one with "openssl rand -base64 48"; after changing it, re-enter the SMTP password in the SMTP settings.`,
      );
    }

    this.cipher = createSmtpCipher(key);
  }

  /**
   * Re-encrypt a stored SMTP password still in the legacy format at startup.
   */
  async onModuleInit(): Promise<void> {
    await prepareStoredSmtpPassword(
      this.smtpConfigRepository,
      this.cipher,
      this.logger,
    );
  }

  /**
   * Encrypt a password using AES-256-GCM
   * Format: v2:iv:authTag:encryptedData (all hex encoded)
   */
  encryptPassword(password: string): string {
    return this.cipher.encrypt(password);
  }

  /**
   * Decrypt a password produced by encryptPassword, in either the current or
   * the legacy format
   * @throws Error with a hint to re-enter the password if it cannot be decrypted
   */
  decryptPassword(encryptedPassword: string): string {
    try {
      return this.cipher.decrypt(encryptedPassword);
    } catch (error) {
      this.logger.error(
        SMTP_PASSWORD_UNREADABLE_HINT,
        error instanceof Error ? error.stack : error,
      );
      throw new Error(SMTP_PASSWORD_UNREADABLE_HINT);
    }
  }

  /**
   * Get the current SMTP configuration (singleton with id=1)
   */
  async getConfig(): Promise<SmtpConfig | null> {
    return this.smtpConfigRepository.findOne({
      where: { id: this.SINGLETON_ID },
      relations: ['updatedBy'],
    });
  }

  /**
   * Create or update SMTP configuration
   * Always uses id=1 to enforce singleton pattern
   */
  async createOrUpdateConfig(
    dto: SmtpConfigDto,
    userId: string,
  ): Promise<SmtpConfig | null> {
    // Validate required fields
    if (!dto.host || !dto.fromEmail || !dto.fromName) {
      throw new BadRequestException(
        'Host, fromEmail, and fromName are required fields',
      );
    }

    // Apply port defaults based on security mode if not provided
    let port = dto.port;
    if (!port) {
      port = dto.securityMode === 'tls' ? 465 : 587;
    }

    // Check if config already exists
    const existingConfig = await this.smtpConfigRepository.findOne({
      where: { id: this.SINGLETON_ID },
    });

    // Prepare config data
    const configData: Partial<SmtpConfig> = {
      id: this.SINGLETON_ID,
      host: dto.host,
      port,
      securityMode: dto.securityMode,
      username: dto.username || null,
      fromEmail: dto.fromEmail,
      fromName: dto.fromName,
      replyToEmail: dto.replyToEmail || null,
      enabled: dto.enabled !== undefined ? dto.enabled : true,
      updatedById: userId,
    };

    // Encrypt password if provided
    if (dto.password) {
      configData.encryptedPassword = this.encryptPassword(dto.password);
    } else if (existingConfig) {
      // Keep existing password if not updating
      configData.encryptedPassword = existingConfig.encryptedPassword;
    }

    if (existingConfig) {
      // Update existing config
      await this.smtpConfigRepository.update(
        { id: this.SINGLETON_ID },
        configData,
      );
    } else {
      // Create new config
      const newConfig = this.smtpConfigRepository.create(configData);
      await this.smtpConfigRepository.save(newConfig);
    }

    // Return the updated config
    return this.smtpConfigRepository.findOne({
      where: { id: this.SINGLETON_ID },
      relations: ['updatedBy'],
    });
  }

  /**
   * Delete SMTP configuration
   * Removes the singleton configuration entry
   */
  async deleteConfig(): Promise<void> {
    await this.smtpConfigRepository.delete({ id: this.SINGLETON_ID });
  }
}
