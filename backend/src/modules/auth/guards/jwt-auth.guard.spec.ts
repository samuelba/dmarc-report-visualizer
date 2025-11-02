import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtService } from '../services/jwt.service';
import { User } from '../entities/user.entity';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let jwtService: JwtService;
  let userRepository: Repository<User>;

  const mockJwtService = {
    verifyAccessToken: jest.fn(),
  };

  const mockUserRepository = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
      ],
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
    jwtService = module.get<JwtService>(JwtService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createMockExecutionContext = (
    authHeader?: string,
  ): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            authorization: authHeader,
          },
        }),
      }),
    } as ExecutionContext;
  };

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should throw UnauthorizedException when authorization header is missing', async () => {
      const context = createMockExecutionContext();

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Missing authorization header',
      );
    });

    it('should throw UnauthorizedException when authorization header format is invalid', async () => {
      const context = createMockExecutionContext('InvalidFormat');

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Invalid authorization header format',
      );
    });

    it('should throw UnauthorizedException when token type is not Bearer', async () => {
      const context = createMockExecutionContext('Basic token123');

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Invalid authorization header format',
      );
    });

    it('should throw UnauthorizedException when token is missing', async () => {
      const context = createMockExecutionContext('Bearer ');

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Invalid authorization header format',
      );
    });

    it('should throw UnauthorizedException when token is invalid', async () => {
      const context = createMockExecutionContext('Bearer invalid-token');

      mockJwtService.verifyAccessToken.mockImplementation(() => {
        throw new UnauthorizedException('Invalid or expired access token');
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Invalid or expired access token',
      );
    });

    it('should throw UnauthorizedException when user does not exist', async () => {
      const context = createMockExecutionContext('Bearer valid-token');
      const payload = {
        sub: 'user-123',
        email: 'test@example.com',
        organizationId: null,
      };

      mockJwtService.verifyAccessToken.mockReturnValue(payload);
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(guard.canActivate(context)).rejects.toThrow(
        'User not found',
      );
    });

    it('should allow access and attach user to request when token is valid', async () => {
      const mockRequest = {
        headers: {
          authorization: 'Bearer valid-token',
        },
      };
      const context = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as ExecutionContext;

      const payload = {
        sub: 'user-123',
        email: 'test@example.com',
        organizationId: 'org-456',
      };

      const user = {
        id: 'user-123',
        email: 'test@example.com',
        organizationId: 'org-456',
        passwordHash: 'hash',
        authProvider: 'local',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockJwtService.verifyAccessToken.mockReturnValue(payload);
      mockUserRepository.findOne.mockResolvedValue(user);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockRequest['user']).toEqual({
        id: user.id,
        email: user.email,
        organizationId: user.organizationId,
      });
      expect(jwtService.verifyAccessToken).toHaveBeenCalledWith('valid-token');
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: payload.sub },
      });
    });

    it('should allow access with null organizationId', async () => {
      const mockRequest = {
        headers: {
          authorization: 'Bearer valid-token',
        },
      };
      const context = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as ExecutionContext;

      const payload = {
        sub: 'user-123',
        email: 'test@example.com',
        organizationId: null,
      };

      const user = {
        id: 'user-123',
        email: 'test@example.com',
        organizationId: null,
        passwordHash: 'hash',
        authProvider: 'local',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockJwtService.verifyAccessToken.mockReturnValue(payload);
      mockUserRepository.findOne.mockResolvedValue(user);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockRequest['user']).toEqual({
        id: user.id,
        email: user.email,
        organizationId: null,
      });
    });
  });
});
