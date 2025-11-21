import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import {
  RefreshToken,
  RevocationReason,
} from '../entities/refresh-token.entity';
import { PasswordService } from './password.service';
import { JwtService } from './jwt.service';
import { TotpService } from './totp.service';
import { RecoveryCodeService } from './recovery-code.service';
import { TotpRequiredResponse } from '../interfaces/auth-response.interface';
import {
  InvalidTotpCodeException,
  TotpNotEnabledException,
  ExpiredTempTokenException,
} from '../exceptions/totp.exception';
import { UserRole } from '../enums/user-role.enum';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly totpService: TotpService,
    private readonly recoveryCodeService: RecoveryCodeService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Check if initial setup is needed (no users exist)
   * @returns true if no users exist, false otherwise
   */
  async needsSetup(): Promise<boolean> {
    const userCount = await this.userRepository.count();
    return userCount === 0;
  }

  /**
   * Create the first user account during initial setup
   * @param email User email address
   * @param password User password
   * @returns Created user entity
   * @throws ConflictException if users already exist
   */
  async setup(email: string, password: string): Promise<User> {
    // Check if setup is still needed
    const setupNeeded = await this.needsSetup();
    if (!setupNeeded) {
      throw new ConflictException('Setup has already been completed');
    }

    // Hash the password
    const passwordHash = await this.passwordService.hashPassword(password);

    // Create the user with administrator role
    const user = this.userRepository.create({
      email,
      passwordHash,
      authProvider: 'local',
      role: UserRole.ADMINISTRATOR,
    });

    return await this.userRepository.save(user);
  }

  /**
   * Validate user credentials
   * @param email User email address
   * @param password User password
   * @returns User entity if credentials are valid, null otherwise
   * @throws UnauthorizedException if user uses SAML authentication
   */
  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      return null;
    }

    // Check if user uses SAML authentication
    if (user.authProvider === 'saml') {
      throw new UnauthorizedException(
        "This account uses SSO authentication. Please click 'Sign in with SSO' to log in.",
      );
    }

    const isPasswordValid = await this.passwordService.validatePassword(
      password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  /**
   * Find user by ID
   * @param userId User ID
   * @returns User entity or null if not found
   */
  async findUserById(userId: string): Promise<User | null> {
    return await this.userRepository.findOne({ where: { id: userId } });
  }

  /**
   * Login user and generate access and refresh tokens
   * If TOTP is enabled, returns a temporary token for TOTP verification
   * @param user User entity
   * @param skipTotp Optional flag to bypass TOTP check (for already-authenticated operations)
   * @returns Object with tokens or TotpRequiredResponse with temporary token
   */
  async login(
    user: User,
    skipTotp: boolean = false,
  ): Promise<
    | {
        accessToken: string;
        refreshToken: string;
        user: { id: string; email: string; authProvider: string };
      }
    | TotpRequiredResponse
  > {
    // Check if user has TOTP enabled (unless skipTotp is true)
    if (!skipTotp && user.totpEnabled) {
      // Generate a short-lived temporary token (5 minutes) for TOTP verification
      const tempToken = this.jwtService.generateTempToken(user.id, user.email);

      return {
        totpRequired: true,
        tempToken,
      };
    }

    // TOTP not enabled or skipped - proceed with normal login
    return this.issueTokens(user);
  }

  /**
   * Issue access and refresh tokens for a user
   * Internal method used by login and TOTP verification flows
   * @param user User entity
   * @returns Object containing access token, refresh token, and user info
   */
  private async issueTokens(user: User): Promise<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string; authProvider: string };
  }> {
    // Generate access token
    const accessToken = this.jwtService.generateAccessToken(
      user.id,
      user.email,
      user.role,
      user.authProvider,
      user.organizationId,
    );

    // Generate a new family ID for this login session
    const familyId = crypto.randomUUID();

    // Create refresh token entity
    const refreshTokenEntity = this.refreshTokenRepository.create({
      userId: user.id,
      familyId: familyId,
      token: '', // Will be set after generating JWT
      expiresAt: new Date(
        Date.now() + this.jwtService.getRefreshTokenExpiryMs(),
      ),
      revoked: false,
      revocationReason: null,
    });

    // Save to get the ID
    const savedRefreshToken =
      await this.refreshTokenRepository.save(refreshTokenEntity);

    // Generate refresh token JWT with the token ID
    const refreshToken = this.jwtService.generateRefreshToken(
      user.id,
      savedRefreshToken.id,
    );

    // Hash the refresh token before storing
    const hashedRefreshToken = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    // Update the token with the hashed value
    savedRefreshToken.token = hashedRefreshToken;
    await this.refreshTokenRepository.save(savedRefreshToken);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        authProvider: user.authProvider,
      },
    };
  }

  /**
   * Verify TOTP code and complete login by issuing tokens
   * @param tempToken Temporary token from initial login
   * @param totpCode 6-digit TOTP code
   * @returns Object containing access token, refresh token, and user info
   * @throws UnauthorizedException if temp token or TOTP code is invalid
   */
  async verifyTotpAndLogin(
    tempToken: string,
    totpCode: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string; authProvider: string };
  }> {
    // Verify the temporary token
    let payload;
    try {
      payload = this.jwtService.verifyTempToken(tempToken);
    } catch (_error) {
      throw new ExpiredTempTokenException();
    }

    // Get the user
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User not found. Please log in again.');
    }

    // Check if TOTP is enabled
    if (!user.totpEnabled || !user.totpSecret) {
      throw new TotpNotEnabledException();
    }

    // Get decrypted secret
    const secret = await this.totpService.getDecryptedSecret(user.id);
    if (!secret) {
      throw new TotpNotEnabledException();
    }

    // Validate TOTP code
    const isValid = await this.totpService.validateToken(
      totpCode,
      secret,
      user.id,
    );

    if (!isValid) {
      // Audit log: TOTP verification failed
      this.logger.warn({
        event: 'totp_verification_failed',
        userId: user.id,
        email: user.email,
        reason: 'invalid_code',
        timestamp: new Date().toISOString(),
      });

      throw new InvalidTotpCodeException(
        'Invalid verification code. Make sure your device time is correct and try again.',
      );
    }

    // Update last used timestamp
    await this.totpService.updateLastUsedTimestamp(user.id);

    // Audit log: TOTP verification successful
    this.logger.log({
      event: 'totp_verification_success',
      userId: user.id,
      email: user.email,
      timestamp: new Date().toISOString(),
    });

    // Issue tokens
    return this.issueTokens(user);
  }

  /**
   * Verify recovery code and complete login by issuing tokens
   * @param tempToken Temporary token from initial login
   * @param recoveryCode Recovery code in format XXXX-XXXX-XXXX-XXXX
   * @returns Object containing access token, refresh token, and user info
   * @throws UnauthorizedException if temp token or recovery code is invalid
   */
  async loginWithRecoveryCode(
    tempToken: string,
    recoveryCode: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string; authProvider: string };
  }> {
    // Verify the temporary token
    let payload;
    try {
      payload = this.jwtService.verifyTempToken(tempToken);
    } catch (_error) {
      throw new ExpiredTempTokenException();
    }

    // Get the user
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User not found. Please log in again.');
    }

    // Check if TOTP is enabled
    if (!user.totpEnabled) {
      throw new TotpNotEnabledException();
    }

    // Validate recovery code (throws exception if invalid or already used)
    await this.recoveryCodeService.validateRecoveryCode(user.id, recoveryCode);

    // Update last used timestamp (recovery code counts as TOTP usage)
    await this.totpService.updateLastUsedTimestamp(user.id);

    // Audit log: Recovery code login successful
    this.logger.log({
      event: 'recovery_code_login_success',
      userId: user.id,
      email: user.email,
      timestamp: new Date().toISOString(),
    });

    // Issue tokens
    return this.issueTokens(user);
  }

  /**
   * Refresh access and refresh tokens with rotation
   * Implements refresh token rotation for security
   * Requires BOTH tokens for maximum security - the access token (possibly expired)
   * is validated to ensure it matches the refresh token user
   * @param refreshToken Current refresh token
   * @param accessToken Current (possibly expired) access token - REQUIRED for validation
   * @param ipAddress Client IP address for theft detection logging
   * @returns New access and refresh tokens
   * @throws UnauthorizedException if tokens are invalid, expired, or mismatched
   */
  async refreshTokens(
    refreshToken: string,
    accessToken: string,
    ipAddress?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // Verify the refresh token JWT
    const payload = this.jwtService.verifyRefreshToken(refreshToken);

    // Verify the access token belongs to the same user (ignoring expiration)
    // This provides additional security by ensuring both tokens match
    try {
      const accessPayload =
        this.jwtService.verifyAccessTokenIgnoreExpiration(accessToken);

      // Verify the user ID matches between access and refresh tokens
      if (accessPayload.sub !== payload.sub) {
        this.logger.warn(
          `Token mismatch detected: access token user ${accessPayload.sub} != refresh token user ${payload.sub}`,
        );
        throw new UnauthorizedException(
          'Access token does not match refresh token',
        );
      }
    } catch (error) {
      // If it's already an UnauthorizedException, re-throw it
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // Always throw UnauthorizedException, preserving original message if present
      throw new UnauthorizedException(error?.message || 'Invalid access token');
    }

    // Hash the provided refresh token to compare with stored hash
    const hashedRefreshToken = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    // Find the refresh token in database
    const storedToken = await this.refreshTokenRepository.findOne({
      where: {
        id: payload.tokenId,
        token: hashedRefreshToken,
      },
      relations: ['user'],
    });

    // Case 1: Token not found - invalid token
    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Case 2: Token expired - check this FIRST before revocation
    // An expired token is naturally invalid and doesn't indicate theft
    // This prevents false positives when expired tokens are reused
    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    // Case 3: Token revoked (but not expired) - THEFT DETECTED
    // This applies to ANY revoked token, regardless of revocation_reason
    // We only reach here if the token is NOT expired, so reuse indicates theft
    if (storedToken.revoked) {
      await this.handleTokenTheft(storedToken, ipAddress);
      throw new UnauthorizedException({
        message:
          'Your session has been terminated for security reasons. Please log in again.',
        errorCode: 'SESSION_COMPROMISED',
      });
    }

    // Case 4: Token valid and not revoked - proceed with normal rotation
    // Atomically revoke the old refresh token (token rotation security)
    // Use conditional UPDATE to prevent race conditions
    const updateResult = await this.refreshTokenRepository.update(
      {
        id: storedToken.id,
        revoked: false, // Only update if still not revoked
      },
      {
        revoked: true,
        revocationReason: RevocationReason.ROTATION,
      },
    );

    // If affected is 0, another request already revoked this token (concurrent use)
    // This is also a theft scenario - the "race condition" detected token reuse
    if (updateResult.affected === 0) {
      // Reload the token from database to get the accurate revocationReason
      // The in-memory storedToken still has revoked: false, but the DB has the updated state
      const reloadedToken = await this.refreshTokenRepository.findOne({
        where: { id: storedToken.id },
        relations: ['user'],
      });

      // Use reloaded token for accurate logging, fallback to storedToken if reload fails
      await this.handleTokenTheft(reloadedToken || storedToken, ipAddress);
      throw new UnauthorizedException({
        message:
          'Your session has been terminated for security reasons. Please log in again.',
        errorCode: 'SESSION_COMPROMISED',
      });
    }

    // Successfully revoked the token - proceed with generating new tokens
    const newAccessToken = this.jwtService.generateAccessToken(
      storedToken.user.id,
      storedToken.user.email,
      storedToken.user.role,
      storedToken.user.authProvider,
      storedToken.user.organizationId,
    );

    // Create new refresh token entity with SAME familyId
    const newRefreshTokenEntity = this.refreshTokenRepository.create({
      userId: storedToken.user.id,
      familyId: storedToken.familyId, // Preserve family ID
      token: '', // Will be set after generating JWT
      expiresAt: new Date(
        Date.now() + this.jwtService.getRefreshTokenExpiryMs(),
      ),
      revoked: false,
      revocationReason: null,
    });

    // Save to get the ID
    const savedNewRefreshToken = await this.refreshTokenRepository.save(
      newRefreshTokenEntity,
    );

    // Generate new refresh token JWT
    const newRefreshToken = this.jwtService.generateRefreshToken(
      storedToken.user.id,
      savedNewRefreshToken.id,
    );

    // Hash the new refresh token before storing
    const hashedNewRefreshToken = crypto
      .createHash('sha256')
      .update(newRefreshToken)
      .digest('hex');

    // Update the token with the hashed value
    savedNewRefreshToken.token = hashedNewRefreshToken;
    await this.refreshTokenRepository.save(savedNewRefreshToken);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Logout user by revoking their refresh token
   * @param userId User ID
   * @param refreshToken Refresh token JWT string
   * @throws UnauthorizedException if refresh token is invalid
   */
  async logout(userId: string, refreshToken: string): Promise<void> {
    // Verify the refresh token JWT
    const payload = this.jwtService.verifyRefreshToken(refreshToken);

    // Verify the token belongs to the user
    if (payload.sub !== userId) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Hash the provided refresh token to compare with stored hash
    const hashedRefreshToken = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    // Find and revoke the refresh token
    const storedToken = await this.refreshTokenRepository.findOne({
      where: {
        id: payload.tokenId,
        token: hashedRefreshToken,
        userId,
      },
    });

    if (storedToken) {
      storedToken.revoked = true;
      storedToken.revocationReason = RevocationReason.LOGOUT;
      await this.refreshTokenRepository.save(storedToken);
    }
  }

  /**
   * Handle detected token theft by invalidating entire token family
   * @param revokedToken The revoked token that was reused (regardless of revocation_reason)
   * @param ipAddress IP address of the request (for logging)
   *
   * Design Decision: This method is called for ANY revoked token reuse, regardless of the
   * original revocation_reason (rotation, logout, password_change). This ensures comprehensive
   * theft detection - if an attacker has a token that was revoked for any reason and tries to
   * use it, we treat it as a potential security incident.
   */
  private async handleTokenTheft(
    revokedToken: RefreshToken,
    ipAddress?: string,
  ): Promise<void> {
    // Get theft detection configuration
    const config = this.configService.get('auth.theftDetection', {
      enabled: true,
      invalidateFamily: true,
    });

    // If theft detection is disabled, do NOT log or invalidate
    // Just return silently - the caller will throw a standard 401
    if (!config.enabled) {
      return;
    }

    // Log security alert (async, non-blocking)
    this.logger.error('Token theft detected', {
      userId: revokedToken.userId,
      familyId: revokedToken.familyId,
      tokenId: revokedToken.id,
      originalRevocationReason: revokedToken.revocationReason,
      ipAddress: ipAddress || 'unknown',
      timestamp: new Date().toISOString(),
    });

    // If configured to only log (not invalidate), return
    if (!config.invalidateFamily) {
      return;
    }

    // Invalidate all tokens in the family (implemented in subtask 3.4)
    const result = await this.refreshTokenRepository.update(
      {
        familyId: revokedToken.familyId,
        revoked: false,
      },
      {
        revoked: true,
        revocationReason: RevocationReason.THEFT_DETECTED,
      },
    );

    // Log family invalidation (async, non-blocking)
    this.logger.warn('Token family invalidated due to theft detection', {
      familyId: revokedToken.familyId,
      tokensInvalidated: result.affected,
    });
  }

  /**
   * Change user password and invalidate all refresh tokens
   * @param userId User ID
   * @param currentPassword Current password
   * @param newPassword New password
   * @throws UnauthorizedException if current password is incorrect or user uses SAML
   * @throws NotFoundException if user not found
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<User> {
    // Find the user
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if user uses SAML authentication
    if (user.authProvider === 'saml') {
      throw new UnauthorizedException(
        "Password management is handled by your organization's Identity Provider.",
      );
    }

    // Validate current password
    const isCurrentPasswordValid = await this.passwordService.validatePassword(
      currentPassword,
      user.passwordHash,
    );

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Hash the new password
    const newPasswordHash =
      await this.passwordService.hashPassword(newPassword);

    // Update the user's password
    user.passwordHash = newPasswordHash;
    await this.userRepository.save(user);

    // Invalidate all refresh tokens for this user (force re-authentication on all devices)
    await this.refreshTokenRepository.update(
      { userId, revoked: false },
      { revoked: true, revocationReason: RevocationReason.PASSWORD_CHANGE },
    );

    // Return the user for generating new tokens
    return user;
  }
}
