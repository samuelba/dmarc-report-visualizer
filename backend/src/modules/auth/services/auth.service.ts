import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { PasswordService } from './password.service';
import { JwtService } from './jwt.service';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
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

    // Create the user
    const user = this.userRepository.create({
      email,
      passwordHash,
      authProvider: 'local',
    });

    return await this.userRepository.save(user);
  }

  /**
   * Validate user credentials
   * @param email User email address
   * @param password User password
   * @returns User entity if credentials are valid, null otherwise
   */
  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      return null;
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
   * Login user and generate access and refresh tokens
   * @param user User entity
   * @returns Object containing access token, refresh token, and user info
   */
  async login(user: User): Promise<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string };
  }> {
    // Generate access token
    const accessToken = this.jwtService.generateAccessToken(
      user.id,
      user.email,
      user.organizationId,
    );

    // Create refresh token entity
    const refreshTokenEntity = this.refreshTokenRepository.create({
      userId: user.id,
      token: '', // Will be set after generating JWT
      expiresAt: new Date(
        Date.now() + this.jwtService.getRefreshTokenExpiryMs(),
      ),
      revoked: false,
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
      },
    };
  }

  /**
   * Refresh access token using a valid refresh token (with token rotation)
   * @param refreshToken Refresh token JWT string
   * @returns Object containing new access token and new refresh token
   * @throws UnauthorizedException if refresh token is invalid or revoked
   */
  async refreshTokens(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // Verify the refresh token JWT
    const payload = this.jwtService.verifyRefreshToken(refreshToken);

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

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Check if token is revoked
    if (storedToken.revoked) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    // Check if token is expired
    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    // Revoke the old refresh token (token rotation security)
    storedToken.revoked = true;
    await this.refreshTokenRepository.save(storedToken);

    // Generate new access token
    const newAccessToken = this.jwtService.generateAccessToken(
      storedToken.user.id,
      storedToken.user.email,
      storedToken.user.organizationId,
    );

    // Create new refresh token entity
    const newRefreshTokenEntity = this.refreshTokenRepository.create({
      userId: storedToken.user.id,
      token: '', // Will be set after generating JWT
      expiresAt: new Date(
        Date.now() + this.jwtService.getRefreshTokenExpiryMs(),
      ),
      revoked: false,
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
      await this.refreshTokenRepository.save(storedToken);
    }
  }

  /**
   * Change user password and invalidate all refresh tokens
   * @param userId User ID
   * @param currentPassword Current password
   * @param newPassword New password
   * @throws UnauthorizedException if current password is incorrect
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
      { revoked: true },
    );

    // Return the user for generating new tokens
    return user;
  }
}
