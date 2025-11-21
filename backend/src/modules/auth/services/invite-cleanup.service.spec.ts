import { Test, TestingModule } from '@nestjs/testing';
import { InviteCleanupService } from './invite-cleanup.service';
import { InviteService } from './invite.service';

describe('InviteCleanupService', () => {
  let service: InviteCleanupService;
  let inviteService: InviteService;

  const mockInviteService = {
    cleanupExpiredInvites: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InviteCleanupService,
        {
          provide: InviteService,
          useValue: mockInviteService,
        },
      ],
    }).compile();

    service = module.get<InviteCleanupService>(InviteCleanupService);
    inviteService = module.get<InviteService>(InviteService);

    // Reset mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('cleanupExpiredInvites', () => {
    it('should call InviteService.cleanupExpiredInvites', async () => {
      mockInviteService.cleanupExpiredInvites.mockResolvedValue(undefined);

      await service.cleanupExpiredInvites();

      expect(inviteService.cleanupExpiredInvites).toHaveBeenCalled();
    });

    it('should log when cleanup starts', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log');
      mockInviteService.cleanupExpiredInvites.mockResolvedValue(undefined);

      await service.cleanupExpiredInvites();

      expect(logSpy).toHaveBeenCalledWith('Starting invite cleanup job');
    });

    it('should log when cleanup completes successfully', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log');
      mockInviteService.cleanupExpiredInvites.mockResolvedValue(undefined);

      await service.cleanupExpiredInvites();

      expect(logSpy).toHaveBeenCalledWith(
        'Invite cleanup completed successfully',
      );
    });

    it('should handle cleanup errors gracefully', async () => {
      const error = new Error('Database error');
      const errorSpy = jest.spyOn(service['logger'], 'error');
      mockInviteService.cleanupExpiredInvites.mockRejectedValue(error);

      // Should not throw, but log the error
      await expect(service.cleanupExpiredInvites()).resolves.not.toThrow();

      expect(errorSpy).toHaveBeenCalledWith(
        'Invite cleanup failed',
        error.stack,
      );
    });
  });
});
