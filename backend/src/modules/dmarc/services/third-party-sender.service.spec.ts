import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ThirdPartySenderService } from './third-party-sender.service';
import { ThirdPartySender } from '../entities/third-party-sender.entity';

describe('ThirdPartySenderService', () => {
  let service: ThirdPartySenderService;

  const mockRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  const createMockSender = (
    overrides?: Partial<ThirdPartySender>,
  ): ThirdPartySender => {
    const sender = new ThirdPartySender();
    sender.id = overrides?.id || '123';
    sender.name = overrides?.name || 'SendGrid';
    sender.description = overrides?.description || 'SendGrid email service';
    sender.dkimPattern = overrides?.dkimPattern || '.*\\.sendgrid\\.net$';
    sender.spfPattern = overrides?.spfPattern || 'sendgrid\\.net';
    sender.enabled = overrides?.enabled ?? true;

    // Add mock methods
    sender.matchesDkim = jest.fn((domain: string) => {
      if (!sender.dkimPattern) {
        return false;
      }
      const regex = new RegExp(sender.dkimPattern);
      return regex.test(domain);
    });
    sender.matchesSpf = jest.fn((domain: string) => {
      if (!sender.spfPattern) {
        return false;
      }
      const regex = new RegExp(sender.spfPattern);
      return regex.test(domain);
    });

    return sender;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ThirdPartySenderService,
        {
          provide: getRepositoryToken(ThirdPartySender),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<ThirdPartySenderService>(ThirdPartySenderService);

    jest.clearAllMocks();
    service.invalidateCache();
  });

  describe('findAll', () => {
    it('should return all third-party senders', async () => {
      const mockSenders = [
        createMockSender({ id: '1', name: 'SendGrid' }),
        createMockSender({ id: '2', name: 'Mailgun' }),
      ];

      mockRepository.find.mockResolvedValue(mockSenders);

      const result = await service.findAll();

      expect(result).toEqual(mockSenders);
      expect(mockRepository.find).toHaveBeenCalledWith({
        order: { name: 'ASC' },
      });
    });

    it('should use cache on subsequent calls', async () => {
      const mockSenders = [createMockSender()];
      mockRepository.find.mockResolvedValue(mockSenders);

      // First call - hits database
      const result1 = await service.findAll();
      expect(mockRepository.find).toHaveBeenCalledTimes(1);

      // Second call - uses cache
      const result2 = await service.findAll();
      expect(mockRepository.find).toHaveBeenCalledTimes(1);
      expect(result2).toEqual(result1);
    });

    it('should force refresh cache when forceRefresh is true', async () => {
      const mockSenders = [createMockSender()];
      mockRepository.find.mockResolvedValue(mockSenders);

      // First call
      await service.findAll();
      expect(mockRepository.find).toHaveBeenCalledTimes(1);

      // Force refresh
      await service.findAll(true);
      expect(mockRepository.find).toHaveBeenCalledTimes(2);
    });

    it('should refresh cache after TTL expires', async () => {
      const mockSenders = [createMockSender()];
      mockRepository.find.mockResolvedValue(mockSenders);

      // First call
      await service.findAll();
      expect(mockRepository.find).toHaveBeenCalledTimes(1);

      // Mock time passing (more than 1 minute)
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 61000);

      // Should refresh cache
      await service.findAll();
      expect(mockRepository.find).toHaveBeenCalledTimes(2);

      jest.restoreAllMocks();
    });
  });

  describe('findEnabled', () => {
    it('should return only enabled senders', async () => {
      const mockSenders = [
        createMockSender({ id: '1', enabled: true }),
        createMockSender({ id: '2', enabled: false }),
        createMockSender({ id: '3', enabled: true }),
      ];

      mockRepository.find.mockResolvedValue(mockSenders);

      const result = await service.findEnabled();

      expect(result).toHaveLength(2);
      expect(result.every((s) => s.enabled)).toBe(true);
    });

    it('should return empty array if no enabled senders', async () => {
      const mockSenders = [createMockSender({ id: '1', enabled: false })];

      mockRepository.find.mockResolvedValue(mockSenders);

      const result = await service.findEnabled();

      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return a single sender by ID', async () => {
      const mockSender = createMockSender();
      mockRepository.findOne.mockResolvedValue(mockSender);

      const result = await service.findOne('123');

      expect(result).toEqual(mockSender);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: '123' },
      });
    });

    it('should throw NotFoundException if sender not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
      await expect(service.findOne('999')).rejects.toThrow(
        'Third-party sender with ID 999 not found',
      );
    });
  });

  describe('create', () => {
    it('should create a new third-party sender', async () => {
      const dto = {
        name: 'SendGrid',
        description: 'SendGrid service',
        dkimPattern: '.*\\.sendgrid\\.net$',
        spfPattern: 'sendgrid\\.net',
        enabled: true,
      };

      const mockSender = createMockSender(dto);
      mockRepository.create.mockReturnValue(mockSender);
      mockRepository.save.mockResolvedValue(mockSender);

      const result = await service.create(dto);

      expect(result).toEqual(mockSender);
      expect(mockRepository.create).toHaveBeenCalledWith(dto);
      expect(mockRepository.save).toHaveBeenCalledWith(mockSender);
    });

    it('should default enabled to true if not provided', async () => {
      const dto = {
        name: 'SendGrid',
        dkimPattern: '.*\\.sendgrid\\.net$',
      };

      mockRepository.create.mockReturnValue(createMockSender());
      mockRepository.save.mockResolvedValue(createMockSender());

      await service.create(dto);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true }),
      );
    });

    it('should throw BadRequestException for invalid DKIM pattern', async () => {
      const dto = {
        name: 'SendGrid',
        dkimPattern: '[invalid(regex',
      };

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
      await expect(service.create(dto)).rejects.toThrow(
        /Invalid DKIM regex pattern/,
      );
    });

    it('should throw BadRequestException for invalid SPF pattern', async () => {
      const dto = {
        name: 'SendGrid',
        spfPattern: '[invalid(regex',
      };

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
      await expect(service.create(dto)).rejects.toThrow(
        /Invalid SPF regex pattern/,
      );
    });

    it('should invalidate cache after creation', async () => {
      const dto = {
        name: 'SendGrid',
        dkimPattern: '.*\\.sendgrid\\.net$',
      };

      mockRepository.create.mockReturnValue(createMockSender());
      mockRepository.save.mockResolvedValue(createMockSender());
      mockRepository.find.mockResolvedValue([]);

      // Populate cache
      await service.findAll();
      expect(mockRepository.find).toHaveBeenCalledTimes(1);

      // Create new sender (should invalidate cache)
      await service.create(dto);

      // Next call should hit database again
      await service.findAll();
      expect(mockRepository.find).toHaveBeenCalledTimes(2);
    });
  });

  describe('update', () => {
    it('should update an existing sender', async () => {
      const mockSender = createMockSender();
      mockRepository.findOne.mockResolvedValue(mockSender);
      mockRepository.save.mockResolvedValue({
        ...mockSender,
        name: 'Updated Name',
      });

      const result = await service.update('123', { name: 'Updated Name' });

      expect(result.name).toBe('Updated Name');
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if sender not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.update('999', { name: 'Test' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should validate regex patterns during update', async () => {
      const mockSender = createMockSender();
      mockRepository.findOne.mockResolvedValue(mockSender);

      await expect(
        service.update('123', { dkimPattern: '[invalid' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should only update provided fields', async () => {
      const mockSender = createMockSender({
        name: 'Original',
        description: 'Original Desc',
      });
      mockRepository.findOne.mockResolvedValue(mockSender);
      mockRepository.save.mockImplementation((s) => Promise.resolve(s));

      await service.update('123', { name: 'Updated' });

      expect(mockSender.name).toBe('Updated');
      expect(mockSender.description).toBe('Original Desc');
    });

    it('should invalidate cache after update', async () => {
      const mockSender = createMockSender();
      mockRepository.findOne.mockResolvedValue(mockSender);
      mockRepository.save.mockResolvedValue(mockSender);
      mockRepository.find.mockResolvedValue([mockSender]);

      // Populate cache
      await service.findAll();
      expect(mockRepository.find).toHaveBeenCalledTimes(1);

      // Update sender
      await service.update('123', { name: 'Updated' });

      // Next call should hit database again
      await service.findAll();
      expect(mockRepository.find).toHaveBeenCalledTimes(2);
    });
  });

  describe('delete', () => {
    it('should delete a sender', async () => {
      const mockSender = createMockSender();
      mockRepository.findOne.mockResolvedValue(mockSender);
      mockRepository.remove.mockResolvedValue(mockSender);

      await service.delete('123');

      expect(mockRepository.remove).toHaveBeenCalledWith(mockSender);
    });

    it('should throw NotFoundException if sender not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.delete('999')).rejects.toThrow(NotFoundException);
    });

    it('should invalidate cache after deletion', async () => {
      const mockSender = createMockSender();
      mockRepository.findOne.mockResolvedValue(mockSender);
      mockRepository.remove.mockResolvedValue(mockSender);
      mockRepository.find.mockResolvedValue([mockSender]);

      // Populate cache
      await service.findAll();
      expect(mockRepository.find).toHaveBeenCalledTimes(1);

      // Delete sender
      await service.delete('123');

      // Next call should hit database again
      await service.findAll();
      expect(mockRepository.find).toHaveBeenCalledTimes(2);
    });
  });

  describe('isDkimThirdParty', () => {
    it('should return true if DKIM domain matches a pattern', async () => {
      const mockSender = createMockSender({
        dkimPattern: '.*\\.sendgrid\\.net$',
      });
      mockRepository.find.mockResolvedValue([mockSender]);

      const result = await service.isDkimThirdParty('mail.sendgrid.net');

      expect(result.isThirdParty).toBe(true);
      expect(result.sender).toEqual(mockSender);
    });

    it('should return false if DKIM domain does not match', async () => {
      const mockSender = createMockSender({
        dkimPattern: '.*\\.sendgrid\\.net$',
      });
      mockRepository.find.mockResolvedValue([mockSender]);

      const result = await service.isDkimThirdParty('example.com');

      expect(result.isThirdParty).toBe(false);
      expect(result.sender).toBeUndefined();
    });

    it('should return false for empty domain', async () => {
      const result = await service.isDkimThirdParty('');

      expect(result.isThirdParty).toBe(false);
      expect(mockRepository.find).not.toHaveBeenCalled();
    });

    it('should only check enabled senders', async () => {
      const enabledSender = createMockSender({ id: '1', enabled: true });
      const disabledSender = createMockSender({ id: '2', enabled: false });
      mockRepository.find.mockResolvedValue([enabledSender, disabledSender]);

      await service.isDkimThirdParty('mail.sendgrid.net');

      // Should filter to only enabled senders
      const enabledSenders = await service.findEnabled();
      expect(enabledSenders).toHaveLength(1);
    });
  });

  describe('isSpfThirdParty', () => {
    it('should return true if SPF domain matches a pattern', async () => {
      const mockSender = createMockSender({
        spfPattern: 'sendgrid\\.net',
      });
      mockRepository.find.mockResolvedValue([mockSender]);

      const result = await service.isSpfThirdParty('sendgrid.net');

      expect(result.isThirdParty).toBe(true);
      expect(result.sender).toEqual(mockSender);
    });

    it('should return false if SPF domain does not match', async () => {
      const mockSender = createMockSender({
        spfPattern: 'sendgrid\\.net',
      });
      mockRepository.find.mockResolvedValue([mockSender]);

      const result = await service.isSpfThirdParty('example.com');

      expect(result.isThirdParty).toBe(false);
      expect(result.sender).toBeUndefined();
    });

    it('should return false for empty domain', async () => {
      const result = await service.isSpfThirdParty('');

      expect(result.isThirdParty).toBe(false);
      expect(mockRepository.find).not.toHaveBeenCalled();
    });
  });

  describe('invalidateCache', () => {
    it('should clear the cache', async () => {
      const mockSenders = [createMockSender()];
      mockRepository.find.mockResolvedValue(mockSenders);

      // Populate cache
      await service.findAll();
      expect(mockRepository.find).toHaveBeenCalledTimes(1);

      // Invalidate cache
      service.invalidateCache();

      // Next call should hit database
      await service.findAll();
      expect(mockRepository.find).toHaveBeenCalledTimes(2);
    });
  });
});
