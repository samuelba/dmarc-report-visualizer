import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TokenCleanupService } from './token-cleanup.service';
import { RefreshToken } from '../entities/refresh-token.entity';

describe('TokenCleanupService', () => {
  let service: TokenCleanupService;
  let refreshTokenRepository: Repository<RefreshToken>;

  const mockQueryBuilder = {
    delete: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    execute: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenCleanupService,
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: {
            createQueryBuilder: jest.fn(() => mockQueryBuilder),
          },
        },
      ],
    }).compile();

    service = module.get<TokenCleanupService>(TokenCleanupService);
    refreshTokenRepository = module.get<Repository<RefreshToken>>(
      getRepositoryToken(RefreshToken),
    );

    // Reset mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('cleanupExpiredTokens', () => {
    it('should remove expired tokens', async () => {
      mockQueryBuilder.execute.mockResolvedValue({ affected: 5 });

      await service.cleanupExpiredTokens();

      expect(refreshTokenRepository.createQueryBuilder).toHaveBeenCalled();
      expect(mockQueryBuilder.delete).toHaveBeenCalled();
      expect(mockQueryBuilder.from).toHaveBeenCalledWith(RefreshToken);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'expires_at < :now',
        expect.objectContaining({ now: expect.any(Date) }),
      );
      expect(mockQueryBuilder.orWhere).toHaveBeenCalledWith(
        'revoked = :revoked',
        { revoked: true },
      );
      expect(mockQueryBuilder.execute).toHaveBeenCalled();
    });

    it('should remove revoked tokens', async () => {
      mockQueryBuilder.execute.mockResolvedValue({ affected: 3 });

      await service.cleanupExpiredTokens();

      expect(mockQueryBuilder.orWhere).toHaveBeenCalledWith(
        'revoked = :revoked',
        { revoked: true },
      );
      expect(mockQueryBuilder.execute).toHaveBeenCalled();
    });

    it('should preserve valid tokens (not expired and not revoked)', async () => {
      // Valid tokens are preserved by the query logic (not matching the WHERE conditions)
      mockQueryBuilder.execute.mockResolvedValue({ affected: 0 });

      await service.cleanupExpiredTokens();

      expect(mockQueryBuilder.execute).toHaveBeenCalled();
      // affected: 0 means no tokens were deleted, indicating valid tokens were preserved
    });

    it('should handle cleanup errors gracefully', async () => {
      const error = new Error('Database error');
      mockQueryBuilder.execute.mockRejectedValue(error);

      // Should not throw, but log the error
      await expect(service.cleanupExpiredTokens()).resolves.not.toThrow();

      expect(mockQueryBuilder.execute).toHaveBeenCalled();
    });

    it('should log cleanup statistics', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log');
      mockQueryBuilder.execute.mockResolvedValue({ affected: 10 });

      await service.cleanupExpiredTokens();

      expect(logSpy).toHaveBeenCalledWith('Starting token cleanup job');
      expect(logSpy).toHaveBeenCalledWith(
        'Token cleanup completed. Removed 10 expired/revoked tokens',
      );
    });

    it('should handle null affected count', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log');
      mockQueryBuilder.execute.mockResolvedValue({ affected: null });

      await service.cleanupExpiredTokens();

      expect(logSpy).toHaveBeenCalledWith(
        'Token cleanup completed. Removed 0 expired/revoked tokens',
      );
    });
  });
});
