import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { UserRole } from '../enums/user-role.enum';

describe('AdminGuard', () => {
  let guard: AdminGuard;

  beforeEach(() => {
    guard = new AdminGuard();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow access for administrator users', () => {
    const mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            id: 'user-123',
            email: 'admin@example.com',
            role: UserRole.ADMINISTRATOR,
          },
        }),
      }),
    } as ExecutionContext;

    expect(guard.canActivate(mockExecutionContext)).toBe(true);
  });

  it('should block access for non-administrator users', () => {
    const mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            id: 'user-123',
            email: 'user@example.com',
            role: UserRole.USER,
          },
        }),
      }),
    } as ExecutionContext;

    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      'Administrator access required',
    );
  });

  it('should block access for unauthenticated users', () => {
    const mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: null,
        }),
      }),
    } as ExecutionContext;

    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      ForbiddenException,
    );
  });

  it('should block access when user object is missing', () => {
    const mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => ({}),
      }),
    } as ExecutionContext;

    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      ForbiddenException,
    );
  });

  /**
   * Property 1: Administrator-only access control
   * Feature: user-management, Property 1: Administrator-only access control
   * Validates: Requirements 1.4
   *
   * For any user without Administrator_Role, attempting to access user management endpoints should result in a 403 Forbidden response
   */
  describe('Property 1: Administrator-only access control', () => {
    it('should only allow administrators and block all non-administrators', async () => {
      const fc = await import('fast-check');

      fc.assert(
        fc.property(
          // Generate random user data with various roles
          fc.record({
            id: fc.uuid(),
            email: fc.emailAddress(),
            role: fc.constantFrom(UserRole.USER, UserRole.ADMINISTRATOR),
            authProvider: fc.constantFrom('local', 'saml'),
          }),
          (userData) => {
            const mockExecutionContext = {
              switchToHttp: () => ({
                getRequest: () => ({
                  user: userData,
                }),
              }),
            } as ExecutionContext;

            if (userData.role === UserRole.ADMINISTRATOR) {
              // Administrators should be allowed
              const result = guard.canActivate(mockExecutionContext);
              expect(result).toBe(true);
            } else {
              // Non-administrators should be blocked with ForbiddenException
              expect(() => guard.canActivate(mockExecutionContext)).toThrow(
                ForbiddenException,
              );
              expect(() => guard.canActivate(mockExecutionContext)).toThrow(
                'Administrator access required',
              );
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should block all requests without user object', async () => {
      const fc = await import('fast-check');

      fc.assert(
        fc.property(
          // Generate various scenarios without user
          fc.constantFrom({ user: null }, { user: undefined }, {}),
          (requestData) => {
            const mockExecutionContext = {
              switchToHttp: () => ({
                getRequest: () => requestData,
              }),
            } as ExecutionContext;

            // All requests without valid user should be blocked
            expect(() => guard.canActivate(mockExecutionContext)).toThrow(
              ForbiddenException,
            );
          },
        ),
        { numRuns: 50 },
      );
    });
  });
});
