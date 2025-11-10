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
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './services/auth.service';
import { SamlService } from './services/saml.service';
import { RateLimiterService } from './services/rate-limiter.service';
import { JwtService } from './services/jwt.service';
import { SetupDto } from './dto/setup.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SamlConfigDto, SamlConfigResponse } from './dto/saml-config.dto';
import { SetupGuard } from './guards/setup.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { SamlEnabledGuard } from './guards/saml-enabled.guard';
import { Public } from './decorators/public.decorator';
import { AuthResponse } from './interfaces/auth-response.interface';
import { User } from './entities/user.entity';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly samlService: SamlService,
    private readonly rateLimiterService: RateLimiterService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Check if initial setup is needed
   * Public endpoint - no authentication required
   */
  @Public()
  @Get('check-setup')
  async checkSetup(): Promise<{ needsSetup: boolean }> {
    const needsSetup = await this.authService.needsSetup();
    return { needsSetup };
  }

  /**
   * Initial setup endpoint - creates the first user account
   * Protected by SetupGuard - only accessible when no users exist
   */
  @Public()
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

    // Get cookie expiry time (same for both tokens to ensure they persist together)
    const cookieMaxAge = this.jwtService.getRefreshTokenExpiryMs();

    // Set refresh token as HttpOnly, Secure, SameSite=Strict cookie
    this.setRefreshTokenCookie(response, refreshToken, cookieMaxAge);

    // Set access token as HttpOnly, Secure, SameSite=Strict cookie
    this.setAccessTokenCookie(response, accessToken, cookieMaxAge);

    // Return user info in response body (tokens are in cookies)
    return {
      user: userInfo,
    };
  }

  /**
   * Login endpoint - authenticates user and returns tokens
   * Protected by RateLimitGuard - prevents brute-force attacks
   */
  @Public()
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

    // Get cookie expiry time (same for both tokens to ensure they persist together)
    const cookieMaxAge = this.jwtService.getRefreshTokenExpiryMs();

    // Set refresh token as HttpOnly, Secure, SameSite=Strict cookie
    this.setRefreshTokenCookie(response, refreshToken, cookieMaxAge);

    // Set access token as HttpOnly, Secure, SameSite=Strict cookie
    this.setAccessTokenCookie(response, accessToken, cookieMaxAge);

    // Return user info in response body (tokens are in cookies)
    return {
      user: userInfo,
    };
  }

  /**
   * Token refresh endpoint - generates new access and refresh tokens
   * Requires BOTH refresh token AND access token (which may be expired)
   * The access token is validated to ensure it matches the refresh token user
   * Implements token rotation for security
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    // Get refresh token from cookie
    const refreshToken = request.cookies?.refreshToken;

    if (!refreshToken) {
      throw new BadRequestException('Refresh token not found');
    }

    // Get access token from cookie (may be expired, but required for validation)
    const accessToken = request.cookies?.accessToken;

    if (!accessToken) {
      throw new BadRequestException('Access token not found');
    }

    // Extract IP address from request for theft detection logging
    const ipAddress =
      request.ip ||
      (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      request.socket?.remoteAddress ||
      'unknown';

    try {
      // Refresh tokens (with rotation - old token revoked, new tokens generated)
      // Pass both tokens for validation and IP address for theft detection logging
      const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
        await this.authService.refreshTokens(
          refreshToken,
          accessToken,
          ipAddress,
        );

      // Get cookie expiry time (same for both tokens to ensure they persist together)
      const cookieMaxAge = this.jwtService.getRefreshTokenExpiryMs();

      // Set new refresh token cookie
      this.setRefreshTokenCookie(response, newRefreshToken, cookieMaxAge);

      // Set new access token cookie
      this.setAccessTokenCookie(response, newAccessToken, cookieMaxAge);

      // Tokens are in cookies - no response body needed
    } catch (error) {
      // Only clear the cookie for authentication-related errors
      // Don't clear for transient errors (database issues, etc.) that might resolve
      if (error instanceof UnauthorizedException) {
        this.clearRefreshTokenCookie(response);
        this.clearAccessTokenCookie(response);
      }

      throw error;
    }
  }

  /**
   * Logout endpoint - revokes refresh token and clears cookie
   */
  @Post('logout')
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

    // Clear access token cookie
    this.clearAccessTokenCookie(response);

    return { message: 'Logged out successfully' };
  }

  /**
   * Get current user endpoint - returns authenticated user information
   */
  @Get('me')
  async getCurrentUser(
    @Req()
    request: Request & {
      user: { id: string; email: string; authProvider: string };
    },
  ): Promise<{ id: string; email: string; authProvider: string }> {
    return {
      id: request.user.id,
      email: request.user.email,
      authProvider: request.user.authProvider,
    };
  }

  /**
   * Change password endpoint - updates user password and invalidates all other sessions
   * Issues new access and refresh tokens for the current session via cookies
   */
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Body() changePasswordDto: ChangePasswordDto,
    @Req() request: Request & { user: { id: string; email: string } },
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ message: string }> {
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

    // Get cookie expiry time (same for both tokens to ensure they persist together)
    const cookieMaxAge = this.jwtService.getRefreshTokenExpiryMs();

    // Set new refresh token cookie
    this.setRefreshTokenCookie(response, refreshToken, cookieMaxAge);

    // Set new access token cookie
    this.setAccessTokenCookie(response, accessToken, cookieMaxAge);

    return {
      message:
        'Password changed successfully. All other sessions have been invalidated.',
    };
  }

  /**
   * Helper method to set refresh token cookie with security flags
   */
  private setRefreshTokenCookie(
    response: Response,
    refreshToken: string,
    maxAge: number,
  ): void {
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieSecure =
      this.configService.get<string>(
        'COOKIE_SECURE',
        isProduction ? 'true' : 'false',
      ) === 'true';
    const cookieDomain = this.configService.get<string>('COOKIE_DOMAIN');

    response.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge,
      path: '/',
      ...(cookieDomain && { domain: cookieDomain }),
    });
  }

  /**
   * Helper method to set access token cookie with security flags
   * Note: The access token cookie has the SAME maxAge as the refresh token cookie.
   * This ensures both cookies persist together (including across browser restarts)
   * so they can be used together for refresh token rotation when the access JWT expires.
   * The JWT itself has an expiration that the backend validates, but the cookie
   * container must persist to enable automatic token refresh.
   */
  private setAccessTokenCookie(
    response: Response,
    accessToken: string,
    maxAge: number,
  ): void {
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieSecure =
      this.configService.get<string>(
        'COOKIE_SECURE',
        isProduction ? 'true' : 'false',
      ) === 'true';
    const cookieDomain = this.configService.get<string>('COOKIE_DOMAIN');

    response.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge,
      path: '/',
      ...(cookieDomain && { domain: cookieDomain }),
    });
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

    response.clearCookie('refreshToken', {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/',
      ...(cookieDomain && { domain: cookieDomain }),
    });
  }

  /**
   * Helper method to clear access token cookie
   */
  private clearAccessTokenCookie(response: Response): void {
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieSecure =
      this.configService.get<string>(
        'COOKIE_SECURE',
        isProduction ? 'true' : 'false',
      ) === 'true';
    const cookieDomain = this.configService.get<string>('COOKIE_DOMAIN');

    response.clearCookie('accessToken', {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/',
      ...(cookieDomain && { domain: cookieDomain }),
    });
  }

  /**
   * SAML login initiation endpoint
   * Redirects to IdP for authentication
   * Protected by SamlEnabledGuard - only accessible when SAML is configured and enabled
   */
  @Public()
  @Get('saml/login')
  @UseGuards(SamlEnabledGuard, AuthGuard('saml'))
  async samlLogin(): Promise<void> {
    // This endpoint is handled by Passport SAML strategy
    // It will redirect to the IdP SSO URL
    // No implementation needed - Passport handles the redirect
  }

  /**
   * SAML callback endpoint ACS (Assertion Consumer Service)
   * Receives SAML assertion from IdP and completes authentication
   * Supports both SP-initiated and IdP-initiated flows
   * Protected by AuthGuard('saml') - validates SAML assertion
   */
  @Public()
  @Post('saml/callback')
  @UseGuards(AuthGuard('saml'))
  @HttpCode(HttpStatus.OK)
  async samlCallback(
    @Req() req: Request & { user: User },
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    // User is attached to request by SAML strategy after successful validation
    const user = req.user;

    // Generate JWT tokens
    const { accessToken, refreshToken } = await this.authService.login(user);

    // Get cookie expiry time (same for both tokens to ensure they persist together)
    const cookieMaxAge = this.jwtService.getRefreshTokenExpiryMs();

    // Set refresh token as HttpOnly cookie
    this.setRefreshTokenCookie(response, refreshToken, cookieMaxAge);

    // Set access token as HttpOnly cookie
    this.setAccessTokenCookie(response, accessToken, cookieMaxAge);

    // Redirect to callback page
    // Frontend will use the tokens from cookies
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:4200',
    );
    const redirectUrl = `${frontendUrl}/auth/callback`;

    response.redirect(redirectUrl);
  }

  /**
   * SAML Service Provider metadata endpoint
   * Returns SP metadata XML for IdP configuration
   * Public endpoint - no authentication required
   */
  @Public()
  @Get('saml/metadata')
  async getSamlMetadata(@Res() response: Response): Promise<void> {
    const metadata = await this.samlService.generateSpMetadata();

    response.set('Content-Type', 'application/xml');
    response.send(metadata);
  }

  /**
   * Check SAML status endpoint (public)
   * Returns whether SAML is enabled and configured
   * Used by login page to show/hide SSO button
   */
  @Public()
  @Get('saml/status')
  async getSamlStatus(): Promise<{ enabled: boolean; configured: boolean }> {
    const config = await this.samlService.getConfig();

    if (!config) {
      return { enabled: false, configured: false };
    }

    return {
      enabled: config.enabled,
      configured: !!(
        config.idpEntityId &&
        config.idpSsoUrl &&
        config.idpCertificate
      ),
    };
  }

  /**
   * Get SAML configuration endpoint
   * Returns current SAML configuration status and SP details
   */
  @Get('saml/config')
  async getSamlConfig(): Promise<SamlConfigResponse> {
    const config = await this.samlService.getConfig();
    const spEntityId = this.configService.get<string>('SAML_ENTITY_ID', '');
    const spAcsUrl = this.configService.get<string>('SAML_ACS_URL', '');

    if (!config) {
      // No configuration exists yet
      return {
        enabled: false,
        configured: false,
        spEntityId,
        spAcsUrl,
        hasIdpCertificate: false,
      };
    }

    // Configuration exists
    return {
      enabled: config.enabled,
      configured: !!(
        config.idpEntityId &&
        config.idpSsoUrl &&
        config.idpCertificate
      ),
      spEntityId: config.spEntityId,
      spAcsUrl: config.spAcsUrl,
      idpEntityId: config.idpEntityId || undefined,
      idpSsoUrl: config.idpSsoUrl || undefined,
      hasIdpCertificate: !!config.idpCertificate,
    };
  }

  /**
   * Update SAML configuration endpoint
   * Accepts metadata XML or manual field entry
   */
  @Post('saml/config')
  @HttpCode(HttpStatus.OK)
  async updateSamlConfig(
    @Body() dto: SamlConfigDto,
    @Req() request: Request & { user: { id: string } },
  ): Promise<SamlConfigResponse> {
    // Update configuration
    const config = await this.samlService.createOrUpdateConfig(
      dto,
      request.user.id,
    );

    // Return updated configuration response
    return {
      enabled: config.enabled,
      configured: !!(
        config.idpEntityId &&
        config.idpSsoUrl &&
        config.idpCertificate
      ),
      spEntityId: config.spEntityId,
      spAcsUrl: config.spAcsUrl,
      idpEntityId: config.idpEntityId || undefined,
      idpSsoUrl: config.idpSsoUrl || undefined,
      hasIdpCertificate: !!config.idpCertificate,
    };
  }

  /**
   * Enable SAML authentication endpoint
   */
  @Post('saml/config/enable')
  @HttpCode(HttpStatus.OK)
  async enableSaml(): Promise<{ message: string }> {
    await this.samlService.enableSaml();
    return { message: 'SAML authentication enabled successfully' };
  }

  /**
   * Disable SAML authentication endpoint
   */
  @Post('saml/config/disable')
  @HttpCode(HttpStatus.OK)
  async disableSaml(): Promise<{ message: string }> {
    await this.samlService.disableSaml();
    return { message: 'SAML authentication disabled successfully' };
  }

  /**
   * Test SAML configuration endpoint
   * Initiates a test SAML login flow
   * Allows testing even when SAML is disabled for regular users
   */
  @Post('saml/config/test')
  @HttpCode(HttpStatus.OK)
  async testSamlConfig(): Promise<{
    success: boolean;
    message: string;
    loginUrl?: string;
  }> {
    // Check if SAML is configured
    const config = await this.samlService.getConfig();

    if (!config) {
      return {
        success: false,
        message:
          'SAML is not configured. Please configure SAML settings first.',
      };
    }

    if (!config.idpEntityId || !config.idpSsoUrl || !config.idpCertificate) {
      return {
        success: false,
        message:
          'SAML configuration is incomplete. Please ensure all IdP settings are configured.',
      };
    }

    // Return the SAML login URL for testing
    const apiUrl = this.configService.get<string>(
      'API_URL',
      'http://localhost:3000',
    );
    const loginUrl = `${apiUrl}/auth/saml/login`;

    return {
      success: true,
      message:
        'SAML configuration is valid. You can test the login flow using the provided URL.',
      loginUrl,
    };
  }
}
