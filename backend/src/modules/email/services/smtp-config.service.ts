import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { SmtpConfig } from '../entities/smtp-config.entity';
import { SmtpConfigDto } from '../dto/smtp-config.dto';

@Injectable()
export class SmtpConfigService {
  private readonly SINGLETON_ID = 1;
  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly IV_LENGTH = 16;
  private readonly AUTH_TAG_LENGTH = 16;
  private readonly encryptionKey: Buffer;

  constructor(
    @InjectRepository(SmtpConfig)
    private readonly smtpConfigRepository: Repository<SmtpConfig>,
    private readonly configService: ConfigService,
  ) {
    const key = this.configService.get<string>('SMTP_ENCRYPTION_KEY');
    if (!key) {
      throw new Error('SMTP_ENCRYPTION_KEY environment variable is required');
    }

    // Ensure key is 32 bytes for AES-256
    this.encryptionKey = Buffer.from(key.padEnd(32, '0').slice(0, 32));
  }

  /**
   * Encrypt a password using AES-256-GCM
   * Format: iv:authTag:encryptedData (all hex encoded)
   */
  encryptPassword(password: string): string {
    const iv = randomBytes(this.IV_LENGTH);
    const cipher = createCipheriv(this.ALGORITHM, this.encryptionKey, iv);

    let encrypted = cipher.update(password, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Combine iv, authTag, and encrypted data
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt a password using AES-256-GCM
   * Expects format: iv:authTag:encryptedData (all hex encoded)
   */
  decryptPassword(encryptedPassword: string): string {
    const parts = encryptedPassword.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted password format');
    }

    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = createDecipheriv(this.ALGORITHM, this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
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
