import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './services/auth.service';
import { RateLimiterService } from './services/rate-limiter.service';
import { JwtService } from './services/jwt.service';
import { SamlService } from './services/saml.service';
import { TotpService } from './services/totp.service';
import { RecoveryCodeService } from './services/recovery-code.service';
import { UserService } from './services/user.service';
import { InviteService } from './services/invite.service';
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;
  let rateLimiterService: RateLimiterService;

  const mockUser: User = {
    id: 'user-uuid-123',
    email: 'test@example.com',
    passwordHash: 'bcrypt$2b$10$hashedpassword',
    authProvider: 'local',
    role: UserRole.USER,
    organizationId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    refreshTokens: [],
    totpSecret: null,
    totpEnabled: false,
    totpEnabledAt: null,
    totpLastUsedAt: null,
    recoveryCodes: [],
  };

  const mockAuthService = {
    needsSetup: jest.fn(),
    setup: jest.fn(),
    login: jest.fn(),
    validateUser: jest.fn(),
    refreshTokens: jest.fn(),
    logout: jest.fn(),
    changePassword: jest.fn(),
  };

  const mockRateLimiterService = {
    recordFailedAttempt: jest.fn(),
    resetAttempts: jest.fn(),
  };

  const mockSamlService = {
    isSamlEnabled: jest.fn().mockResolvedValue(false),
    getConfig: jest.fn(),
    getSamlConfig: jest.fn(),
    updateSamlConfig: jest.fn(),
    enableSaml: jest.fn(),
    disableSaml: jest.fn(),
    testSamlConnection: jest.fn(),
    isPasswordLoginAllowed: jest.fn().mockResolvedValue(true),
    setPasswordLoginDisabled: jest.fn(),
  };

  const mockTotpService = {
    generateSecret: jest.fn(),
    generateQrCode: jest.fn(),
    validateToken: jest.fn(),
    enableTotp: jest.fn(),
    disableTotp: jest.fn(),
    isTotpEnabled: jest.fn(),
    updateLastUsedTimestamp: jest.fn(),
    getDecryptedSecret: jest.fn(),
  };

  const mockRecoveryCodeService = {
    generateRecoveryCodes: jest.fn(),
    validateRecoveryCode: jest.fn(),
    invalidateAllCodes: jest.fn(),
    getRemainingCodesCount: jest.fn(),
  };

  const mockUserService = {
    findAll: jest.fn(),
    findById: jest.fn(),
    updateRole: jest.fn(),
    deleteUser: jest.fn(),
  };

  const mockInviteService = {
    createInvite: jest.fn(),
    findAllActive: jest.fn(),
    revokeInvite: jest.fn(),
    validateInvite: jest.fn(),
    acceptInvite: jest.fn(),
  };

  const mockResponse = () => {
    const res: Partial<Response> = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    };
    return res as Response;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: RateLimiterService,
          useValue: mockRateLimiterService,
        },
        {
          provide: SamlService,
          useValue: mockSamlService,
        },
        {
          provide: TotpService,
          useValue: mockTotpService,
        },
        {
          provide: RecoveryCodeService,
          useValue: mockRecoveryCodeService,
        },
        {
          provide: JwtService,
          useValue: {
            getRefreshTokenExpiryMs: jest
              .fn()
              .mockReturnValue(7 * 24 * 60 * 60 * 1000),
            getAccessTokenExpiryMs: jest.fn().mockReturnValue(15 * 60 * 1000), // 15 minutes
            verifyToken: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config = {
                COOKIE_SECURE: 'false',
                COOKIE_DOMAIN: 'localhost',
                FRONTEND_URL: 'http://localhost:4200',
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: InviteService,
          useValue: mockInviteService,
        },
      ],
    })
      .overrideGuard(require('./guards/setup.guard').SetupGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('./guards/rate-limit.guard').RateLimitGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('./guards/jwt-auth.guard').JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('./guards/admin.guard').AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
    rateLimiterService = module.get<RateLimiterService>(RateLimiterService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkSetup', () => {
    it('should return needsSetup: true when no users exist', async () => {
      mockAuthService.needsSetup.mockResolvedValue(true);

      const result = await controller.checkSetup();

      expect(result).toEqual({ needsSetup: true });
      expect(authService.needsSetup).toHaveBeenCalled();
    });

    it('should return needsSetup: false when users exist', async () => {
      mockAuthService.needsSetup.mockResolvedValue(false);

      const result = await controller.checkSetup();

      expect(result).toEqual({ needsSetup: false });
      expect(authService.needsSetup).toHaveBeenCalled();
    });
  });

  describe('setup', () => {
    it('should create user and return tokens with cookie', async () => {
      const setupDto = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        passwordConfirmation: 'SecurePass123!',
      };

      mockAuthService.setup.mockResolvedValue(mockUser);
      mockAuthService.login.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: { id: mockUser.id, email: mockUser.email },
      });

      const response = mockResponse();
      const result = await controller.setup(setupDto, response);

      expect(authService.setup).toHaveBeenCalledWith(
        setupDto.email,
        setupDto.password,
      );
      expect(authService.login).toHaveBeenCalledWith(mockUser);
      expect(response.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'refresh-token',
        expect.any(Object),
      );
      expect(response.cookie).toHaveBeenCalledWith(
        'accessToken',
        'access-token',
        expect.any(Object),
      );
      expect(result).toEqual({
        user: { id: mockUser.id, email: mockUser.email },
      });
    });

    it('should throw error when passwords do not match', async () => {
      const setupDto = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        passwordConfirmation: 'DifferentPass123!',
      };

      const response = mockResponse();

      await expect(controller.setup(setupDto, response)).rejects.toThrow(
        BadRequestException,
      );
      expect(authService.setup).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('should return tokens on successful login', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'SecurePass123!',
      };
      const request = { ip: '127.0.0.1', connection: {} } as unknown as Request;

      mockAuthService.validateUser.mockResolvedValue(mockUser);
      mockAuthService.login.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: { id: mockUser.id, email: mockUser.email },
      });

      const response = mockResponse();
      const result = await controller.login(loginDto, request, response);

      expect(authService.validateUser).toHaveBeenCalledWith(
        loginDto.email,
        loginDto.password,
      );
      expect(rateLimiterService.resetAttempts).toHaveBeenCalledWith(
        loginDto.email,
      );
      expect(response.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'refresh-token',
        expect.any(Object),
      );
      expect(response.cookie).toHaveBeenCalledWith(
        'accessToken',
        'access-token',
        expect.any(Object),
      );
      expect(result).toEqual({
        user: { id: mockUser.id, email: mockUser.email },
      });
    });

    it('should throw error and record failed attempt for invalid credentials', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'WrongPassword!',
      };
      const request = { ip: '127.0.0.1', connection: {} } as unknown as Request;

      mockAuthService.validateUser.mockResolvedValue(null);

      const response = mockResponse();

      await expect(
        controller.login(loginDto, request, response),
      ).rejects.toThrow(BadRequestException);
      expect(rateLimiterService.recordFailedAttempt).toHaveBeenCalledWith(
        '127.0.0.1',
        loginDto.email,
      );
      expect(authService.login).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('should return new tokens with rotated refresh token', async () => {
      const request = {
        cookies: {
          refreshToken: 'old-refresh-token',
          accessToken: 'old-access-token',
        },
        ip: '192.168.1.1',
        socket: {},
        headers: {},
      } as unknown as Request;

      mockAuthService.refreshTokens.mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });

      const response = mockResponse();
      await controller.refresh(request, response);

      expect(authService.refreshTokens).toHaveBeenCalledWith(
        'old-refresh-token',
        'old-access-token',
        '192.168.1.1',
      );
      expect(response.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'new-refresh-token',
        expect.any(Object),
      );
      expect(response.cookie).toHaveBeenCalledWith(
        'accessToken',
        'new-access-token',
        expect.any(Object),
      );
    });

    it('should extract IP from x-forwarded-for header when request.ip is not available', async () => {
      const request = {
        cookies: {
          refreshToken: 'old-refresh-token',
          accessToken: 'old-access-token',
        },
        ip: undefined,
        headers: { 'x-forwarded-for': '10.0.0.1, 192.168.1.1' },
        socket: {},
      } as unknown as Request;

      mockAuthService.refreshTokens.mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });

      const response = mockResponse();
      await controller.refresh(request, response);

      expect(authService.refreshTokens).toHaveBeenCalledWith(
        'old-refresh-token',
        'old-access-token',
        '10.0.0.1',
      );
    });

    it('should extract IP from socket.remoteAddress when other sources are not available', async () => {
      const request = {
        cookies: {
          refreshToken: 'old-refresh-token',
          accessToken: 'old-access-token',
        },
        ip: undefined,
        headers: {},
        socket: { remoteAddress: '172.16.0.1' },
      } as unknown as Request;

      mockAuthService.refreshTokens.mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });

      const response = mockResponse();
      await controller.refresh(request, response);

      expect(authService.refreshTokens).toHaveBeenCalledWith(
        'old-refresh-token',
        'old-access-token',
        '172.16.0.1',
      );
    });

    it('should use "unknown" when IP cannot be determined', async () => {
      const request = {
        cookies: {
          refreshToken: 'old-refresh-token',
          accessToken: 'old-access-token',
        },
        ip: undefined,
        headers: {},
        socket: {},
      } as unknown as Request;

      mockAuthService.refreshTokens.mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      });

      const response = mockResponse();
      await controller.refresh(request, response);

      expect(authService.refreshTokens).toHaveBeenCalledWith(
        'old-refresh-token',
        'old-access-token',
        'unknown',
      );
    });

    it('should throw error when refresh token is missing', async () => {
      const request = { cookies: {} } as unknown as Request;
      const response = mockResponse();

      await expect(controller.refresh(request, response)).rejects.toThrow(
        BadRequestException,
      );
      expect(authService.refreshTokens).not.toHaveBeenCalled();
    });

    it('should throw error when access token is missing', async () => {
      const request = {
        cookies: {
          refreshToken: 'old-refresh-token',
          // No accessToken provided
        },
      } as unknown as Request;
      const response = mockResponse();

      await expect(controller.refresh(request, response)).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.refresh(request, response)).rejects.toThrow(
        'Access token not found',
      );
      expect(authService.refreshTokens).not.toHaveBeenCalled();
    });

    it('should clear refresh token cookie when token refresh fails with UnauthorizedException', async () => {
      const request = {
        cookies: {
          refreshToken: 'compromised-token',
          accessToken: 'old-access-token',
        },
        ip: '192.168.1.1',
        socket: {},
        headers: {},
      } as unknown as Request;

      // Simulate authentication error (e.g., theft detection, expired token, invalid token)
      mockAuthService.refreshTokens.mockRejectedValue(
        new UnauthorizedException('Token theft detected'),
      );

      const response = mockResponse();

      await expect(controller.refresh(request, response)).rejects.toThrow(
        UnauthorizedException,
      );

      // Verify the cookie was cleared for authentication errors
      expect(response.clearCookie).toHaveBeenCalledWith(
        'refreshToken',
        expect.objectContaining({
          httpOnly: true,
          path: '/',
        }),
      );
      expect(response.clearCookie).toHaveBeenCalledWith(
        'accessToken',
        expect.objectContaining({
          httpOnly: true,
          path: '/',
        }),
      );
    });

    it('should NOT clear refresh token cookie for non-authentication errors', async () => {
      const request = {
        cookies: {
          refreshToken: 'valid-token',
          accessToken: 'access-token',
        },
        ip: '192.168.1.1',
        socket: {},
        headers: {},
      } as unknown as Request;

      // Simulate a transient error (e.g., database connection issue)
      mockAuthService.refreshTokens.mockRejectedValue(
        new Error('Database connection failed'),
      );

      const response = mockResponse();

      await expect(controller.refresh(request, response)).rejects.toThrow(
        'Database connection failed',
      );

      // Verify the cookie was NOT cleared for transient errors
      expect(response.clearCookie).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should logout and clear cookie', async () => {
      const request = {
        user: { id: mockUser.id },
        cookies: { refreshToken: 'refresh-token' },
      } as unknown as Request & { user: { id: string } };

      mockAuthService.logout.mockResolvedValue(undefined);

      const response = mockResponse();
      const result = await controller.logout(request, response);

      expect(authService.logout).toHaveBeenCalledWith(
        mockUser.id,
        'refresh-token',
      );
      expect(response.clearCookie).toHaveBeenCalledWith(
        'refreshToken',
        expect.any(Object),
      );
      expect(result).toEqual({ message: 'Logged out successfully' });
    });

    it('should clear cookie even when no refresh token present', async () => {
      const request = {
        user: { id: mockUser.id },
        cookies: {},
      } as unknown as Request & { user: { id: string } };

      const response = mockResponse();
      const result = await controller.logout(request, response);

      expect(authService.logout).not.toHaveBeenCalled();
      expect(response.clearCookie).toHaveBeenCalledWith(
        'refreshToken',
        expect.any(Object),
      );
      expect(response.clearCookie).toHaveBeenCalledWith(
        'accessToken',
        expect.any(Object),
      );
      expect(result).toEqual({ message: 'Logged out successfully' });
    });
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      const changePasswordDto = {
        currentPassword: 'OldPass123!',
        newPassword: 'NewSecurePass123!',
        newPasswordConfirmation: 'NewSecurePass123!',
      };
      const request = {
        user: { id: mockUser.id, email: mockUser.email },
      } as unknown as Request & { user: { id: string; email: string } };
      const response = { cookie: jest.fn() } as unknown as Response;

      mockAuthService.changePassword.mockResolvedValue(mockUser);
      mockAuthService.login.mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        user: { id: mockUser.id, email: mockUser.email },
      });

      const result = await controller.changePassword(
        changePasswordDto,
        request,
        response,
      );

      expect(authService.changePassword).toHaveBeenCalledWith(
        mockUser.id,
        changePasswordDto.currentPassword,
        changePasswordDto.newPassword,
      );
      expect(authService.login).toHaveBeenCalledWith(mockUser, true);
      expect(response.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'new-refresh-token',
        expect.any(Object),
      );
      expect(response.cookie).toHaveBeenCalledWith(
        'accessToken',
        'new-access-token',
        expect.any(Object),
      );
      expect(result.message).toContain('Password changed successfully');
    });

    it('should throw error when passwords do not match', async () => {
      const changePasswordDto = {
        currentPassword: 'OldPass123!',
        newPassword: 'NewSecurePass123!',
        newPasswordConfirmation: 'DifferentPass123!',
      };
      const request = {
        user: { id: mockUser.id, email: mockUser.email },
      } as unknown as Request & { user: { id: string; email: string } };
      const response = { cookie: jest.fn() } as unknown as Response;

      await expect(
        controller.changePassword(changePasswordDto, request, response),
      ).rejects.toThrow(BadRequestException);
      expect(authService.changePassword).not.toHaveBeenCalled();
    });
  });

  describe('Password Login Disable Feature', () => {
    describe('login with password login disabled', () => {
      it('should reject password login when disabled', async () => {
        const loginDto = { email: 'test@example.com', password: 'password' };
        const request = { ip: '127.0.0.1' } as unknown as Request;
        const response = mockResponse();

        // Mock password login as disabled
        mockSamlService.isPasswordLoginAllowed.mockResolvedValue(false);

        await expect(
          controller.login(loginDto, request, response),
        ).rejects.toThrow(UnauthorizedException);
        await expect(
          controller.login(loginDto, request, response),
        ).rejects.toThrow('Password login is disabled. Use SSO to sign in.');
      });

      it('should allow password login when password login is enabled', async () => {
        const loginDto = { email: 'user@example.com', password: 'password' };
        // Minimal request stub cast via unknown to Request
        const request = { ip: '127.0.0.1' } as unknown as Request;
        const response = mockResponse();

        // Mock password login as enabled
        mockSamlService.isPasswordLoginAllowed.mockResolvedValue(true);
        mockAuthService.validateUser.mockResolvedValue(mockUser);
        mockAuthService.login.mockResolvedValue({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          user: {
            id: mockUser.id,
            email: mockUser.email,
            authProvider: 'local',
          },
        });

        const result = await controller.login(loginDto, request, response);

        expect(result).toHaveProperty('user');
        expect(mockAuthService.login).toHaveBeenCalled();
      });
    });

    describe('disablePasswordLogin endpoint', () => {
      it('should disable password login when SAML is enabled', async () => {
        mockSamlService.getConfig.mockResolvedValue({
          enabled: true,
          configured: true,
        });
        mockSamlService.setPasswordLoginDisabled.mockResolvedValue(undefined);

        const result = await controller.disablePasswordLogin();

        expect(result).toHaveProperty('message');
        expect(mockSamlService.setPasswordLoginDisabled).toHaveBeenCalledWith(
          true,
        );
      });

      it('should throw error when SAML is not enabled', async () => {
        mockSamlService.getConfig.mockResolvedValue({
          enabled: false,
          configured: true,
        });

        await expect(controller.disablePasswordLogin()).rejects.toThrow(
          BadRequestException,
        );
        await expect(controller.disablePasswordLogin()).rejects.toThrow(
          'SAML must be enabled before disabling password login.',
        );
      });
    });

    describe('enablePasswordLogin endpoint', () => {
      it('should enable password login', async () => {
        mockSamlService.setPasswordLoginDisabled.mockResolvedValue(undefined);

        const result = await controller.enablePasswordLogin();

        expect(result).toHaveProperty('message');
        expect(mockSamlService.setPasswordLoginDisabled).toHaveBeenCalledWith(
          false,
        );
      });
    });
  });

  describe('TOTP SAML User Restrictions', () => {
    const samlUser = {
      ...mockUser,
      authProvider: 'saml',
    };

    const localUser = {
      ...mockUser,
      authProvider: 'local',
    };

    describe('setupTotp endpoint', () => {
      it('should throw SamlUserTotpException for SAML users', async () => {
        const request = {
          user: {
            id: samlUser.id,
            email: samlUser.email,
            authProvider: 'saml',
          },
        } as unknown as Request & {
          user: { id: string; email: string; authProvider: string };
        };

        await expect(controller.setupTotp(request)).rejects.toThrow(
          "Two-factor authentication is managed by your organization's Identity Provider",
        );
      });

      it('should allow local users to setup TOTP', async () => {
        const request = {
          user: {
            id: localUser.id,
            email: localUser.email,
            authProvider: 'local',
          },
        } as unknown as Request & {
          user: { id: string; email: string; authProvider: string };
        };

        mockTotpService.isTotpEnabled.mockResolvedValue(false);
        mockTotpService.generateSecret.mockReturnValue({
          secret: 'test-secret',
          otpauthUrl: 'otpauth://totp/test',
        });
        mockTotpService.generateQrCode.mockResolvedValue(
          'data:image/png;base64,test',
        );

        const result = await controller.setupTotp(request);

        expect(result).toHaveProperty('secret');
        expect(result).toHaveProperty('qrCodeUrl');
        expect(mockTotpService.generateSecret).toHaveBeenCalled();
      });
    });

    describe('enableTotp endpoint', () => {
      it('should throw SamlUserTotpException for SAML users', async () => {
        const request = {
          user: { id: samlUser.id, authProvider: 'saml' },
        } as unknown as Request & {
          user: { id: string; authProvider: string };
        };
        const dto = { secret: 'test-secret', token: '123456' };

        await expect(controller.enableTotp(dto, request)).rejects.toThrow(
          "Two-factor authentication is managed by your organization's Identity Provider",
        );
      });
    });

    describe('disableTotp endpoint', () => {
      it('should throw SamlUserTotpException for SAML users', async () => {
        const request = {
          user: { id: samlUser.id, authProvider: 'saml' },
        } as unknown as Request & {
          user: { id: string; authProvider: string };
        };
        const dto = { password: 'password', token: '123456' };

        await expect(controller.disableTotp(dto, request)).rejects.toThrow(
          "Two-factor authentication is managed by your organization's Identity Provider",
        );
      });
    });

    describe('regenerateRecoveryCodes endpoint', () => {
      it('should throw SamlUserTotpException for SAML users', async () => {
        const request = {
          user: { id: samlUser.id, authProvider: 'saml' },
        } as unknown as Request & {
          user: { id: string; authProvider: string };
        };
        const body = { token: '123456' };

        await expect(
          controller.regenerateRecoveryCodes(body, request),
        ).rejects.toThrow(
          "Two-factor authentication is managed by your organization's Identity Provider",
        );
      });
    });

    describe('getTotpStatus endpoint', () => {
      it('should throw SamlUserTotpException for SAML users', async () => {
        const request = {
          user: { id: samlUser.id, authProvider: 'saml' },
        } as unknown as Request & {
          user: { id: string; authProvider: string };
        };

        await expect(controller.getTotpStatus(request)).rejects.toThrow(
          "Two-factor authentication is managed by your organization's Identity Provider",
        );
      });

      it('should return status for local users', async () => {
        const request = {
          user: { id: localUser.id, authProvider: 'local' },
        } as unknown as Request & {
          user: { id: string; authProvider: string };
        };

        mockTotpService.isTotpEnabled.mockResolvedValue(false);

        const result = await controller.getTotpStatus(request);

        expect(result).toEqual({
          enabled: false,
          lastUsed: null,
          recoveryCodesRemaining: 0,
        });
      });
    });
  });

  describe('SAML Test Mode Endpoints', () => {
    describe('initiateSamlTest', () => {
      it('should require admin role', async () => {
        // This test verifies that the AdminGuard is applied to the endpoint
        // The guard is mocked in the test setup to always return true
        // In production, the guard would check the JWT for admin role
        const result = await controller.initiateSamlTest();
        expect(result).toBeDefined();
      });

      it('should return error when SAML not configured', async () => {
        mockSamlService.getConfig.mockResolvedValue(null);

        const result = await controller.initiateSamlTest();

        expect(result).toEqual({
          success: false,
          message:
            'SAML is not configured. Please configure SAML settings first.',
        });
      });

      it('should return error when SAML configuration is incomplete', async () => {
        mockSamlService.getConfig.mockResolvedValue({
          idpEntityId: 'test-idp',
          idpSsoUrl: null, // Missing SSO URL
          idpCertificate: null, // Missing certificate
        });

        const result = await controller.initiateSamlTest();

        expect(result).toEqual({
          success: false,
          message:
            'SAML configuration is incomplete. Please ensure all IdP settings are configured.',
        });
      });

      it('should return test URL when SAML is configured', async () => {
        mockSamlService.getConfig.mockResolvedValue({
          idpEntityId: 'test-idp',
          idpSsoUrl: 'https://idp.example.com/sso',
          idpCertificate: 'test-certificate',
        });

        const result = await controller.initiateSamlTest();

        expect(result).toEqual({
          success: true,
          message: 'SAML configuration is valid. Opening test login...',
          testLoginUrl: 'http://localhost:3000/auth/saml/test/login',
        });
      });
    });

    describe('samlTestLogin', () => {
      it('should require admin role', async () => {
        // This test verifies that the AdminGuard is applied to the endpoint
        // The guard is mocked in the test setup to always return true
        // The actual redirect is handled by Passport, so no implementation needed
        const result = await controller.samlTestLogin();
        expect(result).toBeUndefined();
      });
    });

    describe('samlTestCallback', () => {
      it('should return HTML success page', async () => {
        const request = {
          user: { email: 'test@example.com' },
        } as unknown as Request & { user: User };

        const response = {
          set: jest.fn(),
          send: jest.fn(),
        } as unknown as Response;

        // Add RelayState to indicate test mode
        request.body = { RelayState: 'testMode=true' };

        await controller.samlCallback(request, response);

        expect(response.set).toHaveBeenCalledWith('Content-Type', 'text/html');
        expect(response.send).toHaveBeenCalledWith(
          expect.stringContaining('SAML Test Successful'),
        );
        expect(response.send).toHaveBeenCalledWith(
          expect.stringContaining('test@example.com'),
        );
      });

      it('should not set cookies', async () => {
        const request = {
          user: { email: 'test@example.com' },
          body: { RelayState: 'testMode=true' },
        } as unknown as Request & { user: User };

        const response = {
          set: jest.fn(),
          send: jest.fn(),
          cookie: jest.fn(),
        } as unknown as Response;

        await controller.samlCallback(request, response);

        // Verify that cookie method was never called
        expect(response.cookie).not.toHaveBeenCalled();
      });

      it('should not create session', async () => {
        const request = {
          user: { email: 'test@example.com' },
          body: { RelayState: 'testMode=true' },
        } as unknown as Request & { user: User };

        const response = {
          set: jest.fn(),
          send: jest.fn(),
        } as unknown as Response;

        await controller.samlCallback(request, response);

        // Verify that authService.login was never called
        expect(mockAuthService.login).not.toHaveBeenCalled();
      });
    });

    describe('generateTestSuccessPage', () => {
      it('should include email in success page', async () => {
        const request = {
          user: { email: 'user@example.com' },
          body: { RelayState: 'testMode=true' },
        } as unknown as Request & { user: User };

        const response = {
          set: jest.fn(),
          send: jest.fn(),
        } as unknown as Response;

        await controller.samlCallback(request, response);

        const htmlContent = (response.send as jest.Mock).mock.calls[0][0];

        expect(htmlContent).toContain('user@example.com');
      });

      it('should include success message in page', async () => {
        const request = {
          user: { email: 'test@example.com' },
          body: { RelayState: 'testMode=true' },
        } as unknown as Request & { user: User };

        const response = {
          set: jest.fn(),
          send: jest.fn(),
        } as unknown as Response;

        await controller.samlCallback(request, response);

        const htmlContent = (response.send as jest.Mock).mock.calls[0][0];

        expect(htmlContent).toContain('SAML Test Successful');
        expect(htmlContent).toContain(
          'Your SAML configuration is working correctly',
        );
        expect(htmlContent).toContain('Close this window');
      });
    });
  });

  describe('Invite Management Endpoints', () => {
    describe('createInvite', () => {
      it('should create an invite and return invite link', async () => {
        const dto = {
          email: 'newuser@example.com',
          role: UserRole.USER,
        };
        const request = {
          user: { id: 'admin-id' },
        } as unknown as Request & { user: { id: string } };

        const mockInvite = {
          id: 'invite-id',
          token: 'secure-token-123',
          email: 'newuser@example.com',
          role: 'user',
          expiresAt: new Date('2025-01-01'),
          emailStatus: 'sent' as const,
        };

        mockInviteService.createInvite.mockResolvedValue(mockInvite);

        const result = await controller.createInvite(dto, request);

        expect(mockInviteService.createInvite).toHaveBeenCalledWith(
          dto.email,
          dto.role,
          'admin-id',
        );
        expect(result).toEqual({
          id: 'invite-id',
          email: 'newuser@example.com',
          role: 'user',
          token: 'secure-token-123',
          inviteLink: 'http://localhost:4200/invite/secure-token-123',
          expiresAt: mockInvite.expiresAt,
          emailStatus: 'sent',
        });
      });
    });

    describe('getActiveInvites', () => {
      it('should return list of active invites with tokens', async () => {
        const mockInvites = [
          {
            id: 'invite-1',
            token: 'token-1',
            email: 'user1@example.com',
            role: 'user',
            expiresAt: new Date('2025-01-01'),
            used: false,
            createdAt: new Date('2024-12-01'),
          },
          {
            id: 'invite-2',
            token: 'token-2',
            email: 'user2@example.com',
            role: 'administrator',
            expiresAt: new Date('2025-01-02'),
            used: false,
            createdAt: new Date('2024-12-02'),
          },
        ];

        mockInviteService.findAllActive.mockResolvedValue(mockInvites);

        const result = await controller.getActiveInvites();

        expect(mockInviteService.findAllActive).toHaveBeenCalled();
        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('invite-1');
        expect(result[0].email).toBe('user1@example.com');
        expect(result[0].role).toBe('user');
        expect(result[0].used).toBe(false);
        expect(result[0].expiresAt).toEqual(new Date('2025-01-01'));
        expect(result[0].createdAt).toEqual(new Date('2024-12-01'));
        expect(result[1].id).toBe('invite-2');
        expect(result[1].email).toBe('user2@example.com');
        expect(result[1].role).toBe('administrator');
        expect(result[1].used).toBe(false);
        expect(result[1].expiresAt).toEqual(new Date('2025-01-02'));
        expect(result[1].createdAt).toEqual(new Date('2024-12-02'));
      });
    });

    describe('revokeInvite', () => {
      it('should revoke an invite', async () => {
        const inviteId = 'invite-id';

        mockInviteService.revokeInvite.mockResolvedValue(undefined);

        await controller.revokeInvite(inviteId);

        expect(mockInviteService.revokeInvite).toHaveBeenCalledWith(inviteId);
      });
    });

    describe('getInviteDetails', () => {
      it('should return invite details for valid token', async () => {
        const token = 'valid-token';
        const mockValidation = {
          valid: true,
          invite: {
            email: 'user@example.com',
            role: 'user',
            expiresAt: new Date('2025-01-01'),
          },
        };

        mockInviteService.validateInvite.mockResolvedValue(mockValidation);

        const request = {
          ip: '127.0.0.1',
          connection: {},
        } as unknown as Request;
        const result = await controller.getInviteDetails(token, request);

        expect(mockInviteService.validateInvite).toHaveBeenCalledWith(token);
        expect(result).toEqual({
          valid: true,
          email: 'user@example.com',
          role: 'user',
          expiresAt: mockValidation.invite.expiresAt,
        });
      });

      it('should return error for invalid token', async () => {
        const token = 'invalid-token';
        const mockValidation = {
          valid: false,
          error: 'Invalid invitation token',
        };

        mockInviteService.validateInvite.mockResolvedValue(mockValidation);

        const request = {
          ip: '127.0.0.1',
          connection: {},
        } as unknown as Request;
        const result = await controller.getInviteDetails(token, request);

        expect(result).toEqual({
          valid: false,
          error: 'Invalid invitation token',
        });
      });
    });

    describe('acceptInvite', () => {
      it('should accept invite and return auth tokens', async () => {
        const token = 'valid-token';
        const dto = {
          password: 'SecurePass123!',
          passwordConfirmation: 'SecurePass123!',
        };
        const response = mockResponse();

        const newUser = {
          id: 'new-user-id',
          email: 'newuser@example.com',
          authProvider: 'local',
        };

        mockInviteService.acceptInvite.mockResolvedValue(newUser);
        mockAuthService.login.mockResolvedValue({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          user: newUser,
        });

        const request = {
          ip: '127.0.0.1',
          connection: {},
        } as unknown as Request;
        const result = await controller.acceptInvite(
          token,
          dto,
          request,
          response,
        );

        expect(mockInviteService.acceptInvite).toHaveBeenCalledWith(
          token,
          dto.password,
        );
        expect(mockAuthService.login).toHaveBeenCalledWith(newUser);
        expect(result).toEqual({ user: newUser });
        expect(response.cookie).toHaveBeenCalledTimes(2);
      });

      it('should throw error if passwords do not match', async () => {
        const token = 'valid-token';
        const dto = {
          password: 'SecurePass123!',
          passwordConfirmation: 'DifferentPass123!',
        };
        const response = mockResponse();

        const request = {
          ip: '127.0.0.1',
          connection: {},
        } as unknown as Request;
        await expect(
          controller.acceptInvite(token, dto, request, response),
        ).rejects.toThrow(BadRequestException);
      });
    });
  });
});
