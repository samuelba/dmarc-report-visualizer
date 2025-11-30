import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './services/auth.service';
import { UserService } from './services/user.service';
import { SamlService } from './services/saml.service';
import { RateLimiterService } from './services/rate-limiter.service';
import { JwtService } from './services/jwt.service';
import { TotpService } from './services/totp.service';
import { RecoveryCodeService } from './services/recovery-code.service';
import { InviteService } from './services/invite.service';
import { SetupDto } from './dto/setup.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { SamlConfigDto, SamlConfigResponse } from './dto/saml-config.dto';
import {
  TotpSetupResponseDto,
  TotpEnableDto,
  TotpEnableResponseDto,
  TotpDisableDto,
  TotpVerifyDto,
  RecoveryCodeVerifyDto,
  TotpStatusResponseDto,
} from './dto/totp.dto';
import {
  UpdateRoleDto,
  UserResponse,
  CreateInviteDto,
  AcceptInviteDto,
  InviteResponse,
  InviteTokenResponse,
  InviteDetailsResponse,
} from './dto/user-management.dto';
import { SetupGuard } from './guards/setup.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { SamlEnabledGuard } from './guards/saml-enabled.guard';
import { AdminGuard } from './guards/admin.guard';
import { Public } from './decorators/public.decorator';
import { AuthResponse } from './interfaces/auth-response.interface';
import { User } from './entities/user.entity';
import {
  TotpRateLimitException,
  SamlUserTotpException,
  TotpAlreadyEnabledException,
  TotpNotEnabledException,
  InvalidTotpCodeException,
  ExpiredTempTokenException,
  InvalidRecoveryCodeException,
  RecoveryCodeAlreadyUsedException,
} from './exceptions/totp.exception';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly samlService: SamlService,
    private readonly rateLimiterService: RateLimiterService,
    private readonly jwtService: JwtService,
    private readonly totpService: TotpService,
    private readonly recoveryCodeService: RecoveryCodeService,
    private readonly configService: ConfigService,
    private readonly inviteService: InviteService,
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

    // Generate tokens (TOTP is never enabled during setup)
    const loginResult = await this.authService.login(user);

    // Setup should never require TOTP (new user)
    if ('totpRequired' in loginResult) {
      throw new Error('Unexpected TOTP requirement during setup');
    }

    const { accessToken, refreshToken, user: userInfo } = loginResult;

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
  ): Promise<AuthResponse | { totpRequired: true }> {
    const ip = request.ip || request.connection?.remoteAddress || 'unknown';

    // Check if password login is allowed
    const passwordLoginAllowed =
      await this.samlService.isPasswordLoginAllowed();

    if (!passwordLoginAllowed) {
      throw new UnauthorizedException(
        'Password login is disabled. Use SSO to sign in.',
      );
    }

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

    // Generate tokens or return TOTP requirement
    const loginResult = await this.authService.login(user);

    // Check if TOTP is required
    if ('totpRequired' in loginResult) {
      // Set temp token as HttpOnly cookie (5 minute expiry)
      this.setTotpTempTokenCookie(response, loginResult.tempToken);

      // Return TOTP required response (temp token is in cookie)
      return { totpRequired: true };
    }

    const { accessToken, refreshToken, user: userInfo } = loginResult;

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
    const refreshToken = request.cookies?.refreshToken as string | undefined;

    if (!refreshToken) {
      throw new BadRequestException('Refresh token not found');
    }

    // Get access token from cookie (may be expired, but required for validation)
    const accessToken = request.cookies?.accessToken as string | undefined;

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
      await this.authService.logout(request.user.id, String(refreshToken));
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
  getCurrentUser(
    @Req()
    request: Request & {
      user: { id: string; email: string; authProvider: string; role: string };
    },
  ): {
    id: string;
    email: string;
    authProvider: string;
    role: string;
  } {
    return {
      id: request.user.id,
      email: request.user.email,
      authProvider: request.user.authProvider,
      role: request.user.role,
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

    // Generate new tokens for the current session (skip TOTP since user is already authenticated)
    const loginResult = await this.authService.login(user, true);

    // With skipTotp=true, this should never require TOTP
    if ('totpRequired' in loginResult) {
      throw new Error('Unexpected TOTP requirement during password change');
    }

    const { accessToken, refreshToken } = loginResult;

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
   * Helper method to set TOTP temp token cookie with security flags
   * Short-lived cookie (5 minutes) for TOTP verification flow
   */
  private setTotpTempTokenCookie(response: Response, tempToken: string): void {
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieSecure =
      this.configService.get<string>(
        'COOKIE_SECURE',
        isProduction ? 'true' : 'false',
      ) === 'true';
    const cookieDomain = this.configService.get<string>('COOKIE_DOMAIN');

    // 5 minutes expiry (matches JWT temp token expiry)
    const maxAge = 5 * 60 * 1000;

    response.cookie('totpTempToken', tempToken, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge,
      path: '/',
      ...(cookieDomain && { domain: cookieDomain }),
    });
  }

  /**
   * Helper method to clear TOTP temp token cookie
   */
  private clearTotpTempTokenCookie(response: Response): void {
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieSecure =
      this.configService.get<string>(
        'COOKIE_SECURE',
        isProduction ? 'true' : 'false',
      ) === 'true';
    const cookieDomain = this.configService.get<string>('COOKIE_DOMAIN');

    response.clearCookie('totpTempToken', {
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
   * Also handles test mode callbacks (when RelayState contains testMode=true AND valid nonce)
   * Protected by AuthGuard('saml') - validates SAML assertion
   *
   * Security: Test mode requires a valid server-side nonce to prevent attackers
   * from crafting RelayState=testMode=true to bypass session creation.
   * The nonce is generated when an admin initiates the test flow and validated here.
   */
  @Public()
  @Post('saml/callback')
  @UseGuards(AuthGuard('saml'))
  @HttpCode(HttpStatus.OK)
  async samlCallback(
    @Req() req: Request & { user: User; body?: { RelayState?: string } },
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    // Check if this is a test mode callback
    const relayState: string =
      typeof req.body?.RelayState === 'string' ? req.body.RelayState : '';
    const hasTestModeFlag = relayState.includes('testMode=true');

    if (hasTestModeFlag) {
      // Extract and validate the nonce to ensure this test was initiated by an admin
      // This prevents attackers from crafting RelayState=testMode=true to bypass session creation
      const nonce = this.samlService.parseTestNonceFromRelayState(relayState);
      const isValidTestMode =
        await this.samlService.validateAndConsumeTestNonce(nonce || '');

      if (isValidTestMode) {
        // Valid test mode: Display success page without creating session
        const user = req.user;
        const html = this.generateTestSuccessPage(user.email);
        response.set('Content-Type', 'text/html');
        response.send(html);
        return;
      }

      // Invalid nonce - show error page without creating session
      // This prevents session replacement when testing SAML (regardless of whether SAML is enabled)
      // An invalid nonce could mean: expired, Redis unavailable, or forged testMode flag
      const html = this.generateTestErrorPage(
        'SAML test session expired or invalid. Please try testing again from the SAML settings page.',
      );
      response.set('Content-Type', 'text/html');
      response.send(html);
      return;
    }

    // Production mode: Normal SAML login flow
    // User is attached to request by SAML strategy after successful validation
    const user = req.user;

    // Generate JWT tokens (SAML users never have TOTP enabled)
    const loginResult = await this.authService.login(user);

    // SAML should never require TOTP (2FA handled by IdP)
    if ('totpRequired' in loginResult) {
      throw new Error('Unexpected TOTP requirement for SAML user');
    }

    const { accessToken, refreshToken } = loginResult;

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
   * Used by login page to show/hide SSO button and password form
   */
  @Public()
  @Get('saml/status')
  async getSamlStatus(): Promise<{
    enabled: boolean;
    configured: boolean;
    passwordLoginAllowed: boolean;
  }> {
    const config = await this.samlService.getConfig();

    // Check if password login is allowed
    const passwordLoginAllowed =
      await this.samlService.isPasswordLoginAllowed();

    if (!config) {
      return {
        enabled: false,
        configured: false,
        passwordLoginAllowed,
      };
    }

    return {
      enabled: config.enabled,
      configured: !!(
        config.idpEntityId &&
        config.idpSsoUrl &&
        config.idpCertificate
      ),
      passwordLoginAllowed,
    };
  }

  /**
   * Get SAML configuration endpoint
   * Returns current SAML configuration status and SP details
   */
  @Get('saml/config')
  @UseGuards(AdminGuard)
  async getSamlConfig(): Promise<SamlConfigResponse> {
    const config = await this.samlService.getConfig();
    const spEntityId = this.configService.get<string>('SAML_ENTITY_ID', '');
    const spAcsUrl = this.configService.get<string>('SAML_ACS_URL', '');

    // Check if password login is force-enabled via environment variable
    const forceEnablePasswordLogin =
      this.configService.get<string>('FORCE_ENABLE_PASSWORD_LOGIN', 'false') ===
      'true';

    if (!config) {
      // No configuration exists yet
      return {
        enabled: false,
        configured: false,
        spEntityId,
        spAcsUrl,
        hasIdpCertificate: false,
        disablePasswordLogin: false,
        passwordLoginForceEnabled: forceEnablePasswordLogin,
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
      disablePasswordLogin: config.disablePasswordLogin,
      passwordLoginForceEnabled: forceEnablePasswordLogin,
    };
  }

  /**
   * Update SAML configuration endpoint
   * Accepts metadata XML or manual field entry
   */
  @Post('saml/config')
  @UseGuards(AdminGuard)
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

    // Check if password login is force-enabled via environment variable
    const forceEnablePasswordLogin =
      this.configService.get<string>('FORCE_ENABLE_PASSWORD_LOGIN', 'false') ===
      'true';

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
      disablePasswordLogin: config.disablePasswordLogin,
      passwordLoginForceEnabled: forceEnablePasswordLogin,
    };
  }

  /**
   * Enable SAML authentication endpoint
   */
  @Post('saml/config/enable')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async enableSaml(): Promise<{ message: string }> {
    await this.samlService.enableSaml();
    return { message: 'SAML authentication enabled successfully' };
  }

  /**
   * Disable SAML authentication endpoint
   */
  @Post('saml/config/disable')
  @UseGuards(AdminGuard)
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
  @UseGuards(AdminGuard)
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

  /**
   * Disable password-based login endpoint
   * Requires SAML to be enabled before disabling password login
   */
  @Post('saml/config/disable-password-login')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async disablePasswordLogin(): Promise<{ message: string }> {
    // Check if SAML is enabled
    const config = await this.samlService.getConfig();

    if (!config || !config.enabled) {
      throw new BadRequestException(
        'SAML must be enabled before disabling password login.',
      );
    }

    await this.samlService.setPasswordLoginDisabled(true);
    return {
      message:
        'Password login has been disabled. Users must authenticate via SSO.',
    };
  }

  /**
   * Enable password-based login endpoint
   */
  @Post('saml/config/enable-password-login')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async enablePasswordLogin(): Promise<{ message: string }> {
    await this.samlService.setPasswordLoginDisabled(false);
    return { message: 'Password login has been enabled.' };
  }

  /**
   * Initiate SAML test endpoint
   * Validates admin role and returns test login URL
   * Admin only - requires valid JWT access token
   * Allows testing SAML configuration without enabling it for all users
   */
  @Post('saml/test/initiate')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async initiateSamlTest(): Promise<{
    success: boolean;
    message: string;
    testLoginUrl?: string;
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

    // Return the test login URL
    const apiUrl = this.configService.get<string>(
      'API_URL',
      'http://localhost:3000',
    );
    const testLoginUrl = `${apiUrl}/auth/saml/test/login`;

    return {
      success: true,
      message: 'SAML configuration is valid. Opening test login...',
      testLoginUrl,
    };
  }

  /**
   * SAML test login initiation endpoint
   * Redirects to IdP for test authentication
   * Admin only - requires valid JWT access token
   * Bypasses SAML enabled check
   * Uses SamlTestStrategy which loads fresh config from database
   */
  @Get('saml/test/login')
  @UseGuards(AdminGuard, AuthGuard('saml-test'))
  async samlTestLogin(): Promise<void> {
    // This endpoint is handled by Passport SAML Test strategy
    // It will redirect to the IdP SSO URL
    // No implementation needed - Passport handles the redirect
  }

  /**
   * Escape HTML special characters to prevent XSS
   * @param text Text to escape
   * @returns Escaped text safe for HTML insertion
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Generate HTML success page for SAML test
   * Displays success message with authenticated user email
   * Does not create session or set cookies
   * @param email Authenticated user email
   * @returns HTML string
   */
  private generateTestSuccessPage(email: string): string {
    const escapedEmail = this.escapeHtml(email);
    return `<!DOCTYPE html>
<html>
<head>
  <title>SAML Test Successful</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #4d9abf 0%, #2f80a5 100%);
    }
    .container {
      background: white;
      padding: 2rem;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      text-align: center;
      max-width: 500px;
    }
    .success-icon {
      font-size: 64px;
      color: #10b981;
      margin-bottom: 1rem;
    }
    h1 {
      color: #1f2937;
      margin: 0 0 1rem 0;
    }
    p {
      color: #6b7280;
      margin: 0.5rem 0;
    }
    .user-info {
      background: #f3f4f6;
      padding: 1rem;
      border-radius: 4px;
      margin: 1rem 0;
    }
    .close-btn {
      margin-top: 1.5rem;
      padding: 0.75rem 1.5rem;
      background: #4d9abf;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 1rem;
    }
    .close-btn:hover {
      background: #2f80a5;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="success-icon">✓</div>
    <h1>SAML Test Successful</h1>
    <p>Your SAML configuration is working correctly!</p>
    <div class="user-info">
      <p><strong>Authenticated as:</strong></p>
      <p>${escapedEmail}</p>
    </div>
    <p style="font-size: 0.875rem;">This was a test authentication. No session was created.</p>
    <button class="close-btn" onclick="window.close()">Close this window</button>
  </div>
</body>
</html>`;
  }

  /**
   * Generate HTML error page for SAML test
   * Displays error message when test mode validation fails
   * Does not create session or set cookies
   * @param errorMessage Error message to display
   * @returns HTML string
   */
  private generateTestErrorPage(errorMessage: string): string {
    const escapedMessage = this.escapeHtml(errorMessage);
    return `<!DOCTYPE html>
<html>
<head>
  <title>SAML Test Failed</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #4d9abf 0%, #2f80a5 100%);
    }
    .container {
      background: white;
      padding: 2rem;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      text-align: center;
      max-width: 500px;
    }
    .error-icon {
      font-size: 64px;
      color: #ef4444;
      margin-bottom: 1rem;
    }
    h1 {
      color: #1f2937;
      margin: 0 0 1rem 0;
    }
    p {
      color: #6b7280;
      margin: 0.5rem 0;
    }
    .error-info {
      background: #fef2f2;
      padding: 1rem;
      border-radius: 4px;
      margin: 1rem 0;
      color: #991b1b;
    }
    .close-btn {
      margin-top: 1.5rem;
      padding: 0.75rem 1.5rem;
      background: #4d9abf;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 1rem;
    }
    .close-btn:hover {
      background: #2f80a5;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="error-icon">✗</div>
    <h1>SAML Test Failed</h1>
    <div class="error-info">
      <p>${escapedMessage}</p>
    </div>
    <p style="font-size: 0.875rem;">No session was created.</p>
    <button class="close-btn" onclick="window.close()">Close this window</button>
  </div>
</body>
</html>`;
  }

  /**
   * TOTP setup endpoint - generates secret and QR code
   * Requires authentication
   * SAML users cannot use this endpoint
   */
  @Post('totp/setup')
  @HttpCode(HttpStatus.OK)
  async setupTotp(
    @Req()
    request: Request & {
      user: { id: string; email: string; authProvider: string };
    },
  ): Promise<TotpSetupResponseDto> {
    // Check if user is SAML user
    if (request.user.authProvider === 'saml') {
      throw new SamlUserTotpException();
    }

    // Check if TOTP is already enabled
    const isTotpEnabled = await this.totpService.isTotpEnabled(request.user.id);
    if (isTotpEnabled) {
      throw new TotpAlreadyEnabledException();
    }

    // Generate secret and otpauth URL
    const { secret, otpauthUrl } = this.totpService.generateSecret();

    // Generate QR code
    const qrCodeUrl = await this.totpService.generateQrCode(
      otpauthUrl,
      request.user.email,
    );

    return {
      secret,
      qrCodeUrl,
      otpauthUrl,
    };
  }

  /**
   * TOTP enable endpoint - verifies initial code and enables TOTP
   * Requires authentication
   * Returns recovery codes that must be saved by the user
   */
  @Post('totp/enable')
  @HttpCode(HttpStatus.OK)
  async enableTotp(
    @Body() dto: TotpEnableDto,
    @Req() request: Request & { user: { id: string; authProvider: string } },
  ): Promise<TotpEnableResponseDto> {
    // Check if user is SAML user
    if (request.user.authProvider === 'saml') {
      throw new SamlUserTotpException();
    }

    // Check rate limit for TOTP setup
    const rateLimitCheck = await this.rateLimiterService.checkTotpSetupLimit(
      request.user.id,
    );
    if (!rateLimitCheck.allowed) {
      throw new TotpRateLimitException(rateLimitCheck.retryAfter!, 'setup');
    }

    try {
      // Enable TOTP (validates token and stores encrypted secret)
      await this.totpService.enableTotp(request.user.id, dto.secret, dto.token);

      // Reset rate limit on success
      await this.rateLimiterService.resetTotpSetupAttempts(request.user.id);

      // Generate recovery codes
      const recoveryCodes =
        await this.recoveryCodeService.generateRecoveryCodes(request.user.id);

      return { recoveryCodes };
    } catch (error) {
      // Record failed attempt for rate limiting (only for invalid code errors)
      if (error instanceof InvalidTotpCodeException) {
        await this.rateLimiterService.recordTotpSetupAttempt(request.user.id);
      }
      throw error;
    }
  }

  /**
   * TOTP disable endpoint - disables TOTP with password and code verification
   * Requires authentication
   * Invalidates all recovery codes
   * SAML users cannot use this endpoint
   */
  @Post('totp/disable')
  @HttpCode(HttpStatus.OK)
  async disableTotp(
    @Body() dto: TotpDisableDto,
    @Req() request: Request & { user: { id: string; authProvider: string } },
  ): Promise<{ message: string }> {
    // Check if user is SAML user
    if (request.user.authProvider === 'saml') {
      throw new SamlUserTotpException();
    }

    // Disable TOTP (validates password and token)
    await this.totpService.disableTotp(
      request.user.id,
      dto.password,
      dto.token,
    );

    // Invalidate all recovery codes
    await this.recoveryCodeService.invalidateAllCodes(request.user.id);

    return { message: 'Two-factor authentication has been disabled' };
  }

  /**
   * TOTP verify endpoint - verifies TOTP code during login
   * Public endpoint - uses temporary token from HttpOnly cookie
   * Issues access and refresh tokens on success
   */
  @Public()
  @Post('totp/verify')
  @HttpCode(HttpStatus.OK)
  async verifyTotp(
    @Body() dto: TotpVerifyDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    // Get temp token from cookie
    const tempToken = request.cookies?.totpTempToken as string | undefined;

    if (!tempToken) {
      throw new UnauthorizedException(
        'TOTP verification session not found. Please log in again.',
      );
    }

    // Extract user ID from temporary token
    let userId: string;
    try {
      const payload = this.jwtService.verifyTempToken(tempToken);
      userId = payload.sub;
    } catch (_error) {
      // Clear the invalid cookie
      this.clearTotpTempTokenCookie(response);
      throw new ExpiredTempTokenException();
    }

    // Check rate limit for TOTP verification
    const rateLimitCheck =
      await this.rateLimiterService.checkTotpVerificationLimit(userId);
    if (!rateLimitCheck.allowed) {
      throw new TotpRateLimitException(
        rateLimitCheck.retryAfter!,
        'verification',
      );
    }

    try {
      // Verify TOTP and complete login
      const { accessToken, refreshToken, user } =
        await this.authService.verifyTotpAndLogin(tempToken, dto.totpCode);

      // Reset rate limit on success
      await this.rateLimiterService.resetTotpVerificationAttempts(userId);

      // Clear the temp token cookie (no longer needed)
      this.clearTotpTempTokenCookie(response);

      // Get cookie expiry time
      const cookieMaxAge = this.jwtService.getRefreshTokenExpiryMs();

      // Set tokens in cookies
      this.setRefreshTokenCookie(response, refreshToken, cookieMaxAge);
      this.setAccessTokenCookie(response, accessToken, cookieMaxAge);

      return { user };
    } catch (error) {
      // Record failed attempt for rate limiting (only for invalid code errors)
      if (error instanceof InvalidTotpCodeException) {
        await this.rateLimiterService.recordTotpVerificationAttempt(userId);
      }
      throw error;
    }
  }

  /**
   * Recovery code verify endpoint - verifies recovery code during login
   * Public endpoint - uses temporary token from HttpOnly cookie
   * Issues access and refresh tokens on success
   * Marks recovery code as used
   */
  @Public()
  @Post('totp/verify-recovery')
  @HttpCode(HttpStatus.OK)
  async verifyRecoveryCode(
    @Body() dto: RecoveryCodeVerifyDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    // Get temp token from cookie
    const tempToken = request.cookies?.totpTempToken as string | undefined;

    if (!tempToken) {
      throw new UnauthorizedException(
        'TOTP verification session not found. Please log in again.',
      );
    }

    // Extract user ID from temporary token
    let userId: string;
    try {
      const payload = this.jwtService.verifyTempToken(tempToken);
      userId = payload.sub;
    } catch (_error) {
      // Clear the invalid cookie
      this.clearTotpTempTokenCookie(response);
      throw new ExpiredTempTokenException();
    }

    // Check rate limit for recovery code verification
    const rateLimitCheck =
      await this.rateLimiterService.checkRecoveryCodeLimit(userId);
    if (!rateLimitCheck.allowed) {
      throw new TotpRateLimitException(
        rateLimitCheck.retryAfter!,
        'recovery code verification',
      );
    }

    try {
      // Verify recovery code and complete login
      const { accessToken, refreshToken, user } =
        await this.authService.loginWithRecoveryCode(
          tempToken,
          dto.recoveryCode,
        );

      // Reset rate limit on success
      await this.rateLimiterService.resetRecoveryCodeAttempts(userId);

      // Clear the temp token cookie (no longer needed)
      this.clearTotpTempTokenCookie(response);

      // Get cookie expiry time
      const cookieMaxAge = this.jwtService.getRefreshTokenExpiryMs();

      // Set tokens in cookies
      this.setRefreshTokenCookie(response, refreshToken, cookieMaxAge);
      this.setAccessTokenCookie(response, accessToken, cookieMaxAge);

      return { user };
    } catch (error) {
      // Record failed attempt for rate limiting (only for recovery code errors)
      if (
        error instanceof InvalidRecoveryCodeException ||
        error instanceof RecoveryCodeAlreadyUsedException
      ) {
        await this.rateLimiterService.recordRecoveryCodeAttempt(userId);
      }
      throw error;
    }
  }

  /**
   * Regenerate recovery codes endpoint
   * Requires authentication and valid TOTP code
   * Invalidates all existing recovery codes
   * SAML users cannot use this endpoint
   */
  @Post('totp/recovery-codes/regenerate')
  @HttpCode(HttpStatus.OK)
  async regenerateRecoveryCodes(
    @Body() body: { token: string },
    @Req() request: Request & { user: { id: string; authProvider: string } },
  ): Promise<TotpEnableResponseDto> {
    // Check if user is SAML user
    if (request.user.authProvider === 'saml') {
      throw new SamlUserTotpException();
    }

    // Verify TOTP is enabled
    const isTotpEnabled = await this.totpService.isTotpEnabled(request.user.id);
    if (!isTotpEnabled) {
      throw new TotpNotEnabledException();
    }

    // Get decrypted secret
    const secret = await this.totpService.getDecryptedSecret(request.user.id);
    if (!secret) {
      throw new TotpNotEnabledException();
    }

    // Validate TOTP token
    const isValid = await this.totpService.validateToken(
      body.token,
      secret,
      request.user.id,
    );
    if (!isValid) {
      throw new InvalidTotpCodeException();
    }

    // Update last used timestamp
    await this.totpService.updateLastUsedTimestamp(request.user.id);

    // Invalidate all existing recovery codes
    await this.recoveryCodeService.invalidateAllCodes(request.user.id);

    // Generate new recovery codes
    const recoveryCodes = await this.recoveryCodeService.generateRecoveryCodes(
      request.user.id,
    );

    return { recoveryCodes };
  }

  /**
   * Get TOTP status endpoint
   * Requires authentication
   * Returns TOTP enabled status, last used timestamp, and remaining recovery codes
   * SAML users cannot use this endpoint
   */
  @Get('totp/status')
  async getTotpStatus(
    @Req() request: Request & { user: { id: string; authProvider: string } },
  ): Promise<TotpStatusResponseDto> {
    // Check if user is SAML user
    if (request.user.authProvider === 'saml') {
      throw new SamlUserTotpException();
    }

    // Get TOTP enabled status
    const isTotpEnabled = await this.totpService.isTotpEnabled(request.user.id);

    if (!isTotpEnabled) {
      return {
        enabled: false,
        lastUsed: null,
        recoveryCodesRemaining: 0,
      };
    }

    // Get user to retrieve last used timestamp
    const user = await this.authService.findUserById(request.user.id);

    // Get remaining recovery codes count
    const recoveryCodesRemaining =
      await this.recoveryCodeService.getRemainingCodesCount(request.user.id);

    return {
      enabled: true,
      lastUsed: user?.totpLastUsedAt || null,
      recoveryCodesRemaining,
    };
  }

  /**
   * Get all users endpoint
   * Returns list of all users with their roles and details
   * Admin only
   */
  @Get('users')
  @UseGuards(AdminGuard)
  async getAllUsers(): Promise<UserResponse[]> {
    const users = await this.userService.findAll();
    return users.map((user) => ({
      id: user.id,
      email: user.email,
      role: user.role,
      authProvider: user.authProvider,
      createdAt: user.createdAt,
      totpEnabled: user.totpEnabled,
    }));
  }

  /**
   * Update user role endpoint
   * Changes a user's role with last admin protection
   * Admin only
   */
  @Put('users/:id/role')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  async updateUserRole(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @Req() request: Request & { user: { id: string } },
  ): Promise<User> {
    return this.userService.updateRole(id, dto.role, request.user.id);
  }

  /**
   * Delete user endpoint
   * Deletes a user with last admin protection
   * Admin only
   */
  @Delete('users/:id')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUser(
    @Param('id') id: string,
    @Req() request: Request & { user: { id: string } },
  ): Promise<void> {
    await this.userService.deleteUser(id, request.user.id);
  }

  /**
   * Create invite endpoint
   * Generates an invite link for a new user
   * Admin only
   */
  @Post('users/invite')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.CREATED)
  async createInvite(
    @Body() dto: CreateInviteDto,
    @Req() request: Request & { user: { id: string } },
  ): Promise<InviteResponse> {
    // Create the invite
    const invite = await this.inviteService.createInvite(
      dto.email,
      dto.role,
      request.user.id,
    );

    // Build the invite link URL
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:4200',
    );
    const inviteLink = `${frontendUrl}/invite/${invite.token}`;

    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      token: invite.token,
      inviteLink,
      expiresAt: invite.expiresAt,
      emailStatus: invite.emailStatus,
    };
  }

  /**
   * Get active invites endpoint
   * Returns all non-expired, unused invites
   * Admin only
   */
  @Get('invites')
  @UseGuards(AdminGuard)
  async getActiveInvites(): Promise<InviteTokenResponse[]> {
    const invites = await this.inviteService.findAllActive();

    return invites.map((invite) => ({
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      used: invite.used,
      createdAt: invite.createdAt,
    }));
  }

  /**
   * Revoke invite endpoint
   * Marks an invite as used to prevent acceptance
   * Admin only
   */
  @Delete('invites/:id')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeInvite(@Param('id') id: string): Promise<void> {
    await this.inviteService.revokeInvite(id);
  }

  /**
   * Get invite details endpoint
   * Returns invite information for display on acceptance page
   * Public endpoint
   */
  @Public()
  @Get('invite/:token')
  @UseGuards(RateLimitGuard)
  async getInviteDetails(
    @Param('token') token: string,
    @Req() request: Request,
  ): Promise<InviteDetailsResponse> {
    const validation = await this.inviteService.validateInvite(token);

    if (!validation.valid) {
      // Record failed attempt for rate limiting
      const ip = request.ip || request.connection?.remoteAddress || 'unknown';
      await this.rateLimiterService.recordFailedAttempt(ip, 'invite-check');

      return {
        valid: false,
        error: validation.error,
      };
    }

    return {
      valid: true,
      email: validation.invite!.email,
      role: validation.invite!.role,
      expiresAt: validation.invite!.expiresAt,
    };
  }

  /**
   * Accept invite endpoint
   * Creates a user account from an invite and returns auth tokens
   * Public endpoint
   */
  @Public()
  @Post('invite/:token/accept')
  @UseGuards(RateLimitGuard)
  @HttpCode(HttpStatus.OK)
  async acceptInvite(
    @Param('token') token: string,
    @Body() dto: AcceptInviteDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    // Validate password confirmation matches
    if (dto.password !== dto.passwordConfirmation) {
      throw new BadRequestException('Password and confirmation do not match');
    }

    try {
      // Accept the invite and create user
      const user = await this.inviteService.acceptInvite(token, dto.password);

      // Generate tokens (new users never have TOTP enabled)
      const loginResult = await this.authService.login(user);

      // Should never require TOTP for new user
      if ('totpRequired' in loginResult) {
        throw new Error('Unexpected TOTP requirement for new user');
      }

      const { accessToken, refreshToken, user: userInfo } = loginResult;

      // Get cookie expiry time
      const cookieMaxAge = this.jwtService.getRefreshTokenExpiryMs();

      // Set refresh token cookie
      this.setRefreshTokenCookie(response, refreshToken, cookieMaxAge);

      // Set access token cookie
      this.setAccessTokenCookie(response, accessToken, cookieMaxAge);

      // Return user info
      return {
        user: userInfo,
      };
    } catch (error) {
      // Record failed attempt for rate limiting if invite is invalid
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        const ip = request.ip || request.connection?.remoteAddress || 'unknown';
        await this.rateLimiterService.recordFailedAttempt(ip, 'invite-accept');
      }
      throw error;
    }
  }
}
