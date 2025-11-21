import { Test, TestingModule } from '@nestjs/testing';
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
import { User } from './entities/user.entity';
import { UserRole } from './enums/user-role.enum';
import { AdminGuard } from './guards/admin.guard';

describe('AuthController - User Management Property Tests', () => {
  let controller: AuthController;

  // Arbitraries for generating test data
  const userArbitrary = fc.record({
    id: fc.uuid(),
    email: fc.emailAddress(),
    passwordHash: fc.string({ minLength: 60, maxLength: 60 }),
    authProvider: fc.constantFrom('local', 'saml'),
    organizationId: fc.option(fc.uuid(), { nil: null }),
    role: fc.constantFrom(UserRole.USER, UserRole.ADMINISTRATOR),
    totpSecret: fc.option(fc.string(), { nil: null }),
    totpEnabled: fc.boolean(),
    totpEnabledAt: fc.option(fc.date(), { nil: null }),
    totpLastUsedAt: fc.option(fc.date(), { nil: null }),
    createdAt: fc.date(),
    updatedAt: fc.date(),
  });

  const mockUserService = {
    findAll: jest.fn(),
    findById: jest.fn(),
    updateRole: jest.fn(),
    deleteUser: jest.fn(),
    countAdministrators: jest.fn(),
    isLastAdministrator: jest.fn(),
    validateRoleChange: jest.fn(),
    validateUserDeletion: jest.fn(),
  };

  const mockAuthService = {
    needsSetup: jest.fn(),
    setup: jest.fn(),
    login: jest.fn(),
    validateUser: jest.fn(),
    refreshTokens: jest.fn(),
    logout: jest.fn(),
    changePassword: jest.fn(),
    findUserById: jest.fn(),
  };

  const mockSamlService = {
    isSamlEnabled: jest.fn().mockResolvedValue(false),
    getConfig: jest.fn(),
    isPasswordLoginAllowed: jest.fn().mockResolvedValue(true),
  };

  const mockRateLimiterService = {
    recordFailedAttempt: jest.fn(),
    resetAttempts: jest.fn(),
  };

  const mockTotpService = {
    generateSecret: jest.fn(),
    generateQrCode: jest.fn(),
    validateToken: jest.fn(),
    enableTotp: jest.fn(),
    disableTotp: jest.fn(),
    isTotpEnabled: jest.fn(),
  };

  const mockRecoveryCodeService = {
    generateRecoveryCodes: jest.fn(),
    validateRecoveryCode: jest.fn(),
    invalidateAllCodes: jest.fn(),
    getRemainingCodesCount: jest.fn(),
  };

  const mockInviteService = {
    createInvite: jest.fn(),
    findAllActive: jest.fn(),
    revokeInvite: jest.fn(),
    validateInvite: jest.fn(),
    acceptInvite: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: SamlService,
          useValue: mockSamlService,
        },
        {
          provide: RateLimiterService,
          useValue: mockRateLimiterService,
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

  /**
   * Feature: user-management, Property 2: Complete user data retrieval
   * Validates: Requirements 1.2
   *
   * Property: For any request to list users by an administrator, the response should include
   * email, role, authProvider, and createdAt for all users in the system
   */
  describe('Property 2: Complete user data retrieval', () => {
    it('should return all required fields for all users', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(userArbitrary, { minLength: 1, maxLength: 20 }),
          async (users) => {
            // Setup: Mock the service to return the generated users
            const mockUsers = users.map((u) => ({
              ...u,
              refreshTokens: [],
              recoveryCodes: [],
            })) as User[];

            mockUserService.findAll.mockResolvedValue(mockUsers);

            // Execute: Call the endpoint
            const result = await controller.getAllUsers();

            // Verify: All users are returned
            expect(result).toHaveLength(mockUsers.length);

            // Verify: Each user has all required fields
            result.forEach((userResponse, index) => {
              expect(userResponse).toHaveProperty('id');
              expect(userResponse).toHaveProperty('email');
              expect(userResponse).toHaveProperty('role');
              expect(userResponse).toHaveProperty('authProvider');
              expect(userResponse).toHaveProperty('createdAt');
              expect(userResponse).toHaveProperty('totpEnabled');

              // Verify: Fields match the source data
              expect(userResponse.id).toBe(mockUsers[index].id);
              expect(userResponse.email).toBe(mockUsers[index].email);
              expect(userResponse.role).toBe(mockUsers[index].role);
              expect(userResponse.authProvider).toBe(
                mockUsers[index].authProvider,
              );
              expect(userResponse.createdAt).toBe(mockUsers[index].createdAt);
              expect(userResponse.totpEnabled).toBe(
                mockUsers[index].totpEnabled,
              );
            });
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Feature: user-management, Property 3: Role field validity
   * Validates: Requirements 1.5
   *
   * Property: For any user in the system, the role field should be either 'user' or 'administrator'
   */
  describe('Property 3: Role field validity', () => {
    it('should only return valid role values for all users', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(userArbitrary, { minLength: 1, maxLength: 20 }),
          async (users) => {
            // Setup: Mock the service to return the generated users
            const mockUsers = users.map((u) => ({
              ...u,
              refreshTokens: [],
              recoveryCodes: [],
            })) as User[];

            mockUserService.findAll.mockResolvedValue(mockUsers);

            // Execute: Call the endpoint
            const result = await controller.getAllUsers();

            // Verify: All users have valid role values
            result.forEach((userResponse) => {
              expect([UserRole.USER, UserRole.ADMINISTRATOR]).toContain(
                userResponse.role,
              );
            });
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
