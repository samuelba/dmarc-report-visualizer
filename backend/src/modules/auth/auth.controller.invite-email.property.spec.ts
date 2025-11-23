import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import * as fc from 'fast-check';
import { AuthController } from './auth.controller';
import { UserService } from './services/user.service';
import { AuthService } from './services/auth.service';
import { SamlService } from './services/saml.service';
import { RateLimiterService } from './services/rate-limiter.service';
import { JwtService } from './services/jwt.service';
import { TotpService } from './services/totp.service';
import { RecoveryCodeService } from './services/recovery-code.service';
import { InviteService } from './services/invite.service';
import { ConfigService } from '@nestjs/config';
import { UserRole } from './enums/user-role.enum';
import { AdminGuard } from './guards/admin.guard';

/**
 * Feature: smtp-email-service, Property 10: Invite email content inclusion
 * Validates: Requirements 4.1, 4.2
 *
 * Property: For any invitation email, the email content should contain both
 * the recipient's email address and the invitation token
 */
describe('AuthController - Invite Email Property Tests', () => {
  let controller: AuthController;
  let mockInviteService: any;

  // Arbitraries for generating test data
  const emailArbitrary = fc.emailAddress();
  const roleArbitrary = fc.constantFrom(UserRole.USER, UserRole.ADMINISTRATOR);
  const tokenArbitrary = fc.string({ minLength: 32, maxLength: 64 });
  const userIdArbitrary = fc.uuid();

  beforeEach(async () => {
    mockInviteService = {
      createInvite: jest.fn(),
      findAllActive: jest.fn(),
      revokeInvite: jest.fn(),
      validateInvite: jest.fn(),
      acceptInvite: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: UserService,
          useValue: {
            findAll: jest.fn(),
            findById: jest.fn(),
            updateRole: jest.fn(),
            deleteUser: jest.fn(),
          },
        },
        {
          provide: AuthService,
          useValue: {
            needsSetup: jest.fn(),
            setup: jest.fn(),
            login: jest.fn(),
            validateUser: jest.fn(),
            refreshTokens: jest.fn(),
            logout: jest.fn(),
            changePassword: jest.fn(),
          },
        },
        {
          provide: SamlService,
          useValue: {
            isSamlEnabled: jest.fn().mockResolvedValue(false),
            getConfig: jest.fn(),
            isPasswordLoginAllowed: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: RateLimiterService,
          useValue: {
            recordFailedAttempt: jest.fn(),
            resetAttempts: jest.fn(),
          },
        },
        {
          provide: TotpService,
          useValue: {
            generateSecret: jest.fn(),
            generateQrCode: jest.fn(),
            validateToken: jest.fn(),
            enableTotp: jest.fn(),
            disableTotp: jest.fn(),
            isTotpEnabled: jest.fn(),
          },
        },
        {
          provide: RecoveryCodeService,
          useValue: {
            generateRecoveryCodes: jest.fn(),
            validateRecoveryCode: jest.fn(),
            invalidateAllCodes: jest.fn(),
            getRemainingCodesCount: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            getRefreshTokenExpiryMs: jest
              .fn()
              .mockReturnValue(7 * 24 * 60 * 60 * 1000),
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
          provide: InviteService,
          useValue: mockInviteService,
        },
        AdminGuard,
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Property 10: Invite email content inclusion', () => {
    it('should include recipient email and invitation token in the response', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailArbitrary,
          roleArbitrary,
          tokenArbitrary,
          userIdArbitrary,
          async (email, role, token, userId) => {
            // Setup: Mock the invite service to return an invite with the generated data
            const mockInvite = {
              id: fc.sample(fc.uuid(), 1)[0],
              email,
              role,
              token,
              tokenHash: 'mock-hash',
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              used: false,
              usedAt: null,
              usedBy: null,
              createdById: userId,
              createdAt: new Date(),
              updatedAt: new Date(),
              emailStatus: 'sent' as const,
            };

            mockInviteService.createInvite.mockResolvedValue(mockInvite);

            // Execute: Create an invite
            const request = { user: { id: userId } } as unknown as Request & {
              user: { id: string };
            };
            const result = await controller.createInvite(
              { email, role },
              request,
            );

            // Verify: Response includes the recipient email
            expect(result.email).toBe(email);

            // Verify: Response includes the invitation token
            expect(result.token).toBe(token);

            // Verify: Response includes the invitation link with the token
            expect(result.inviteLink).toContain(token);

            // Verify: The invite service was called with the correct email
            expect(mockInviteService.createInvite).toHaveBeenCalledWith(
              email,
              role,
              userId,
            );
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should always return invitation link regardless of email status', async () => {
      await fc.assert(
        fc.asyncProperty(
          emailArbitrary,
          roleArbitrary,
          tokenArbitrary,
          userIdArbitrary,
          fc.constantFrom('sent', 'failed', 'not_configured'),
          async (email, role, token, userId, emailStatus) => {
            // Setup: Mock the invite service with different email statuses
            const mockInvite = {
              id: fc.sample(fc.uuid(), 1)[0],
              email,
              role,
              token,
              tokenHash: 'mock-hash',
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              used: false,
              usedAt: null,
              usedBy: null,
              createdById: userId,
              createdAt: new Date(),
              updatedAt: new Date(),
              emailStatus,
            };

            mockInviteService.createInvite.mockResolvedValue(mockInvite);

            // Execute: Create an invite
            const request = { user: { id: userId } } as unknown as Request & {
              user: { id: string };
            };
            const result = await controller.createInvite(
              { email, role },
              request,
            );

            // Verify: Invitation link is always returned
            expect(result.inviteLink).toBeDefined();
            expect(result.inviteLink).toContain(token);

            // Verify: Email status is included in response
            expect(result.emailStatus).toBe(emailStatus);

            // Verify: Token is always returned for manual distribution
            expect(result.token).toBe(token);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
