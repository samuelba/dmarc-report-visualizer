import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as OTPAuth from 'otpauth';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import { User } from '../entities/user.entity';
import { PasswordService } from './password.service';
import {
  InvalidTotpCodeException,
  TotpAlreadyEnabledException,
  TotpNotEnabledException,
  SamlUserTotpException,
  InvalidPasswordException,
} from '../exceptions/totp.exception';

@Injectable()
export class TotpService {
  private readonly logger = new Logger(TotpService.name);
  private readonly encryptionKey: Buffer;
  private readonly totpWindow: number;
  private readonly totpStep: number;
  private readonly totpIssuer: string;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly configService: ConfigService,
    private readonly passwordService: PasswordService,
  ) {
    // Derive encryption key from JWT_SECRET
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is required for TOTP encryption');
    }
    // Use SHA-256 to derive a 32-byte key from JWT_SECRET
    this.encryptionKey = crypto.createHash('sha256').update(jwtSecret).digest();

    // TOTP configuration
    this.totpWindow = parseInt(
      this.configService.get<string>('TOTP_WINDOW', '3'),
      10,
    );
    this.totpStep = parseInt(
      this.configService.get<string>('TOTP_STEP', '30'),
      10,
    );
    this.totpIssuer = this.configService.get<string>(
      'TOTP_ISSUER',
      'DMARC Dashboard',
    );
  }

  /**
   * Generate a new TOTP secret for a user
   * @returns Object containing the secret and otpauth URL
   */
  generateSecret(): { secret: string; otpauthUrl: string } {
    // Generate a random secret with 160 bits of entropy (32 base32 characters)
    const secret = new OTPAuth.Secret({ size: 20 }); // 20 bytes = 160 bits

    // Create TOTP instance
    const totp = new OTPAuth.TOTP({
      issuer: this.totpIssuer,
      label: 'User', // Will be replaced with actual email during setup
      algorithm: 'SHA1',
      digits: 6,
      period: this.totpStep,
      secret: secret,
    });

    return {
      secret: secret.base32,
      otpauthUrl: totp.toString(),
    };
  }

  /**
   * Generate QR code data URL from otpauth URL
   * @param otpauthUrl The otpauth:// URL
   * @param email User's email to include in the QR code
   * @returns Data URL for QR code image
   */
  async generateQrCode(otpauthUrl: string, email: string): Promise<string> {
    // Replace the generic label with the user's email
    const urlWithEmail = otpauthUrl.replace(
      /label=[^&]+/,
      `label=${encodeURIComponent(email)}`,
    );

    // Generate QR code as data URL
    return await QRCode.toDataURL(urlWithEmail);
  }

  /**
   * Validate a TOTP token against a secret
   * @param token The 6-digit TOTP code
   * @param secret The base32 encoded secret
   * @param userId User ID for tracking last used timestamp
   * @returns True if valid, false otherwise
   */
  async validateToken(
    token: string,
    secret: string,
    userId?: string,
  ): Promise<boolean> {
    try {
      // Create TOTP instance
      const totp = new OTPAuth.TOTP({
        issuer: this.totpIssuer,
        algorithm: 'SHA1',
        digits: 6,
        period: this.totpStep,
        secret: OTPAuth.Secret.fromBase32(secret),
      });

      const currentTime = Date.now();
      const currentTimeStep = Math.floor(currentTime / (this.totpStep * 1000));

      // Validate token with time window first to get the time step delta
      const delta = totp.validate({
        token,
        window: this.totpWindow,
      });

      // If code is invalid, reject immediately
      if (delta === null) {
        this.logger.warn({
          event: 'totp_validation_failed',
          userId: userId || 'unknown',
          reason: 'invalid_code',
          currentTimeStep,
          currentTime: new Date(currentTime).toISOString(),
          totpWindow: this.totpWindow,
          totpStep: this.totpStep,
          message: `TOTP code validation failed: code is invalid for current time step ${currentTimeStep} with window ${this.totpWindow}`,
        });
        return false;
      }

      // Check if code was recently used (prevent replay attacks)
      // We need to check if the same time step was already used
      if (userId) {
        const user = await this.userRepository.findOne({
          where: { id: userId },
        });

        if (user?.totpLastUsedAt) {
          const lastUsedTime = user.totpLastUsedAt.getTime();
          const lastUsedTimeStep = Math.floor(
            lastUsedTime / (this.totpStep * 1000),
          );

          // Calculate the time step that was used for this code
          // delta is the offset from current time step (0 = current, -1 = previous, +1 = next)
          const usedTimeStep = currentTimeStep + delta;

          // If the same time step was already used, reject it (replay attack)
          if (usedTimeStep === lastUsedTimeStep) {
            this.logger.warn({
              event: 'totp_validation_failed',
              userId,
              reason: 'replay_attack',
              currentTimeStep,
              usedTimeStep,
              lastUsedTimeStep,
              delta,
              currentTime: new Date(currentTime).toISOString(),
              lastUsedTime: new Date(lastUsedTime).toISOString(),
              timeSinceLastUse: currentTime - lastUsedTime,
              totpStep: this.totpStep,
              message: `TOTP code validation failed: replay attack detected. Code from time step ${usedTimeStep} was already used at time step ${lastUsedTimeStep}`,
            });
            return false;
          }
        }
      }

      // Code is valid and not a replay
      const usedTimeStep = currentTimeStep + delta;
      this.logger.debug({
        event: 'totp_validation_success',
        userId: userId || 'unknown',
        currentTimeStep,
        usedTimeStep,
        delta,
        currentTime: new Date(currentTime).toISOString(),
        totpWindow: this.totpWindow,
        totpStep: this.totpStep,
        message: `TOTP code validation successful: code from time step ${usedTimeStep} (delta: ${delta}) validated`,
      });
      return true;
    } catch (error) {
      // Log error for debugging security-critical validation failures
      this.logger.error(
        `TOTP validation error for user ${userId || 'unknown'}: ${error.message}`,
        error.stack,
      );
      return false;
    }
  }

  /**
   * Encrypt a TOTP secret using AES-256-GCM
   * @param secret The base32 encoded secret to encrypt
   * @returns Encrypted secret in format: iv:authTag:encryptedData (all hex encoded)
   */
  encryptSecret(secret: string): string {
    // Generate a random initialization vector
    const iv = crypto.randomBytes(16);

    // Create cipher
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    // Encrypt the secret
    let encrypted = cipher.update(secret, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    // Return format: iv:authTag:encryptedData
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt a TOTP secret using AES-256-GCM
   * @param encryptedSecret The encrypted secret in format: iv:authTag:encryptedData
   * @returns Decrypted base32 encoded secret
   */
  decryptSecret(encryptedSecret: string): string {
    try {
      // Parse the encrypted secret
      const parts = encryptedSecret.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted secret format');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];

      // Create decipher
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        this.encryptionKey,
        iv,
      );
      decipher.setAuthTag(authTag);

      // Decrypt the secret
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      this.logger.error(
        'Error decrypting TOTP secret',
        error instanceof Error ? error.stack : error,
      );
      throw new Error('Failed to decrypt TOTP secret');
    }
  }

  /**
   * Enable TOTP for a user after verifying the initial token
   * @param userId User ID
   * @param secret The base32 encoded secret
   * @param token The 6-digit TOTP code for verification
   */
  async enableTotp(
    userId: string,
    secret: string,
    token: string,
  ): Promise<void> {
    // Find the user
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Check if TOTP is already enabled
    if (user.totpEnabled) {
      throw new TotpAlreadyEnabledException();
    }

    // Check if user is SAML user
    if (user.authProvider === 'saml') {
      throw new SamlUserTotpException();
    }

    // Validate the token
    const isValid = await this.validateToken(token, secret);
    if (!isValid) {
      throw new InvalidTotpCodeException();
    }

    // Encrypt and store the secret
    const encryptedSecret = this.encryptSecret(secret);

    // Update user
    user.totpSecret = encryptedSecret;
    user.totpEnabled = true;
    user.totpEnabledAt = new Date();

    await this.userRepository.save(user);

    // Audit log: TOTP enabled
    this.logger.log({
      event: 'totp_enabled',
      userId: user.id,
      email: user.email,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Disable TOTP for a user after verifying password and TOTP code
   * @param userId User ID
   * @param password User's current password
   * @param token The 6-digit TOTP code for verification
   */
  async disableTotp(
    userId: string,
    password: string,
    token: string,
  ): Promise<void> {
    // Find the user
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Check if TOTP is enabled
    if (!user.totpEnabled || !user.totpSecret) {
      throw new TotpNotEnabledException();
    }

    // Verify password
    const isPasswordValid = await this.passwordService.validatePassword(
      password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new InvalidPasswordException();
    }

    // Decrypt secret and validate token
    const secret = this.decryptSecret(user.totpSecret);
    const isTokenValid = await this.validateToken(token, secret, userId);
    if (!isTokenValid) {
      throw new InvalidTotpCodeException();
    }

    // Disable TOTP
    user.totpSecret = null;
    user.totpEnabled = false;
    user.totpEnabledAt = null;
    user.totpLastUsedAt = null;

    await this.userRepository.save(user);

    // Audit log: TOTP disabled
    this.logger.log({
      event: 'totp_disabled',
      userId: user.id,
      email: user.email,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Check if TOTP is enabled for a user
   * @param userId User ID
   * @returns True if TOTP is enabled, false otherwise
   */
  async isTotpEnabled(userId: string): Promise<boolean> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['totpEnabled'],
    });

    return user?.totpEnabled ?? false;
  }

  /**
   * Update the last used timestamp for TOTP
   * @param userId User ID
   */
  async updateLastUsedTimestamp(userId: string): Promise<void> {
    await this.userRepository.update(userId, {
      totpLastUsedAt: new Date(),
    });
  }

  /**
   * Get decrypted TOTP secret for a user
   * @param userId User ID
   * @returns Decrypted base32 secret or null if not enabled
   */
  async getDecryptedSecret(userId: string): Promise<string | null> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['totpSecret', 'totpEnabled'],
    });

    if (!user?.totpEnabled || !user.totpSecret) {
      return null;
    }

    return this.decryptSecret(user.totpSecret);
  }
}
