import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SetupGuard } from './setup.guard';
import { AuthService } from '../services/auth.service';

describe('SetupGuard', () => {
  let guard: SetupGuard;
  let authService: AuthService;

  const mockAuthService = {
    needsSetup: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SetupGuard,
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    guard = module.get<SetupGuard>(SetupGuard);
    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createMockExecutionContext = (): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({}),
      }),
    } as ExecutionContext;
  };

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should allow access when setup is needed (no users exist)', async () => {
      const context = createMockExecutionContext();
      mockAuthService.needsSetup.mockResolvedValue(true);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(authService.needsSetup).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when setup is not needed (users exist)', async () => {
      const context = createMockExecutionContext();
      mockAuthService.needsSetup.mockResolvedValue(false);

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Setup has already been completed',
      );
      expect(authService.needsSetup).toHaveBeenCalled();
    });
  });
});
