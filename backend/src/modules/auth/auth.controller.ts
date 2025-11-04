import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './services/auth.service';
import { RateLimiterService } from './services/rate-limiter.service';
import { JwtService } from './services/jwt.service';
import { SetupDto } from './dto/setup.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SetupGuard } from './guards/setup.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthResponse } from './interfaces/auth-response.interface';
import { TokenResponse } from './interfaces/token-response.interface';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly rateLimiterService: RateLimiterService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Check if initial setup is needed
   * Public endpoint - no authentication required
   */
  @Get('check-setup')
  async checkSetup(): Promise<{ needsSetup: boolean }> {
    const needsSetup = await this.authService.needsSetup();
    return { needsSetup };
  }

  /**
   * Initial setup endpoint - creates the first user account
   * Protected by SetupGuard - only accessible when no users exist
   */
  @Post('setup')
  @UseGuards(SetupGuard)
  @HttpCode(HttpStatus.CREATED)
  async setup(
    @Body() setupDto: SetupDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    // Validate password confirmation matches
    if (setupDto.password !== setupDto.passwordConfirmation) {
      throw new BadRequestException('Password and confirmation do not match');
    }

    // Create the user
    const user = await this.authService.setup(
      setupDto.email,
      setupDto.password,
    );

    // Generate tokens
    const {
      accessToken,
      refreshToken,
      user: userInfo,
    } = await this.authService.login(user);

    // Set refresh token as HttpOnly, Secure, SameSite=Strict cookie
    this.setRefreshTokenCookie(response, refreshToken);

    // Return access token and user info in response body
    return {
      accessToken,
      user: userInfo,
    };
  }

  /**
   * Login endpoint - authenticates user and returns tokens
   * Protected by RateLimitGuard - prevents brute-force attacks
   */
  @Post('login')
  @UseGuards(RateLimitGuard)
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const ip = request.ip || request.connection?.remoteAddress || 'unknown';

    // Validate user credentials
    const user = await this.authService.validateUser(
      loginDto.email,
      loginDto.password,
    );

    if (!user) {
      // Record failed attempt for rate limiting
      await this.rateLimiterService.recordFailedAttempt(ip, loginDto.email);

      // Return generic error message (don't reveal if email exists)
      throw new BadRequestException('Invalid credentials');
    }

    // Reset rate limit attempts on successful login
    await this.rateLimiterService.resetAttempts(loginDto.email);

    // Generate tokens
    const {
      accessToken,
      refreshToken,
      user: userInfo,
    } = await this.authService.login(user);

    // Set refresh token as HttpOnly, Secure, SameSite=Strict cookie
    this.setRefreshTokenCookie(response, refreshToken);

    // Return access token and user info in response body
    return {
      accessToken,
      user: userInfo,
    };
  }

  /**
   * Token refresh endpoint - generates new access and refresh tokens
   * Reads refresh token from HttpOnly cookie
   * Implements token rotation for security
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TokenResponse> {
    // Get refresh token from cookie
    const refreshToken = request.cookies?.refreshToken;

    if (!refreshToken) {
      throw new BadRequestException('Refresh token not found');
    }

    try {
      // Refresh tokens (with rotation - old token revoked, new tokens generated)
      const { accessToken, refreshToken: newRefreshToken } =
        await this.authService.refreshTokens(refreshToken);

      // Set new refresh token cookie
      this.setRefreshTokenCookie(response, newRefreshToken);

      // Return new access token
      return { accessToken };
    } catch (error) {
      console.log('[AUTH] ERROR: Token refresh failed:', error.message);
      throw error;
    }
  }

  /**
   * Logout endpoint - revokes refresh token and clears cookie
   * Protected by JwtAuthGuard - requires valid access token
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: Request & { user: { id: string } },
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ message: string }> {
    // Get refresh token from cookie
    const refreshToken = request.cookies?.refreshToken;

    if (refreshToken) {
      // Revoke the refresh token
      await this.authService.logout(request.user.id, refreshToken);
    }

    // Clear refresh token cookie
    this.clearRefreshTokenCookie(response);

    return { message: 'Logged out successfully' };
  }

  /**
   * Get current user endpoint - returns authenticated user information
   * Protected by JwtAuthGuard - requires valid access token
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getCurrentUser(
    @Req() request: Request & { user: { id: string; email: string } },
  ): Promise<{ id: string; email: string }> {
    return {
      id: request.user.id,
      email: request.user.email,
    };
  }

  /**
   * Change password endpoint - updates user password and invalidates all other sessions
   * Issues a new refresh token for the current session
   * Protected by JwtAuthGuard - requires valid access token
   */
  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Body() changePasswordDto: ChangePasswordDto,
    @Req() request: Request & { user: { id: string; email: string } },
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ message: string; accessToken: string }> {
    // Validate password confirmation matches
    if (
      changePasswordDto.newPassword !==
      changePasswordDto.newPasswordConfirmation
    ) {
      throw new BadRequestException(
        'New password and confirmation do not match',
      );
    }

    // Change the password (this will also invalidate all refresh tokens)
    const user = await this.authService.changePassword(
      request.user.id,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword,
    );

    // Generate new tokens for the current session
    const { accessToken, refreshToken } = await this.authService.login(user);

    // Set new refresh token cookie
    this.setRefreshTokenCookie(response, refreshToken);

    return {
      message:
        'Password changed successfully. All other sessions have been invalidated.',
      accessToken,
    };
  }

  /**
   * Helper method to set refresh token cookie with security flags
   */
  private setRefreshTokenCookie(
    response: Response,
    refreshToken: string,
  ): void {
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieSecure =
      this.configService.get<string>(
        'COOKIE_SECURE',
        isProduction ? 'true' : 'false',
      ) === 'true';
    const cookieDomain = this.configService.get<string>('COOKIE_DOMAIN');

    const cookieOptions: any = {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: this.jwtService.getRefreshTokenExpiryMs(),
      path: '/',
    };

    if (cookieDomain) {
      cookieOptions.domain = cookieDomain;
    }

    response.cookie('refreshToken', refreshToken, cookieOptions);
  }

  /**
   * Helper method to clear refresh token cookie
   */
  private clearRefreshTokenCookie(response: Response): void {
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieSecure =
      this.configService.get<string>(
        'COOKIE_SECURE',
        isProduction ? 'true' : 'false',
      ) === 'true';
    const cookieDomain = this.configService.get<string>('COOKIE_DOMAIN');

    const cookieOptions: any = {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/',
    };

    if (cookieDomain) {
      cookieOptions.domain = cookieDomain;
    }

    response.clearCookie('refreshToken', cookieOptions);
  }
}
