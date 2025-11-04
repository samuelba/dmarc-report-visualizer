import { Test, TestingModule } from '@nestjs/testing';
import { ThirdPartySenderController } from './third-party-sender.controller';
import {
  ThirdPartySenderService,
  CreateThirdPartySenderDto,
  UpdateThirdPartySenderDto,
} from '../services/third-party-sender.service';
import { ThirdPartySender } from '../entities/third-party-sender.entity';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

describe('ThirdPartySenderController', () => {
  let controller: ThirdPartySenderController;
  let service: ThirdPartySenderService;

  // Mock data
  const mockThirdPartySender: ThirdPartySender = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Google Workspace',
    dkimPattern: '.*\\.google\\.com$',
    spfPattern: '^172\\.253\\.',
    description: 'Google Workspace email forwarding service',
    enabled: true,
    createdAt: new Date('2025-01-01T10:00:00Z'),
    updatedAt: new Date('2025-01-01T10:00:00Z'),
    matchesDkim: jest.fn(),
    matchesSpf: jest.fn(),
  };

  const mockThirdPartySender2: ThirdPartySender = {
    id: '123e4567-e89b-12d3-a456-426614174001',
    name: 'Microsoft 365',
    dkimPattern: '.*\\.outlook\\.com$',
    spfPattern: '^40\\.92\\.',
    description: 'Microsoft 365 email service',
    enabled: true,
    createdAt: new Date('2025-01-02T10:00:00Z'),
    updatedAt: new Date('2025-01-02T10:00:00Z'),
    matchesDkim: jest.fn(),
    matchesSpf: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ThirdPartySenderController],
      providers: [
        {
          provide: ThirdPartySenderService,
          useValue: {
            findAll: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ThirdPartySenderController>(
      ThirdPartySenderController,
    );
    service = module.get<ThirdPartySenderService>(ThirdPartySenderService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return an array of third-party senders', async () => {
      const senders = [mockThirdPartySender, mockThirdPartySender2];

      const findAllSpy = jest
        .spyOn(service, 'findAll')
        .mockResolvedValue(senders);

      const result = await controller.findAll();

      expect(result).toEqual(senders);
      expect(result).toHaveLength(2);
      expect(findAllSpy).toHaveBeenCalled();
    });

    it('should return empty array when no senders exist', async () => {
      const findAllSpy = jest.spyOn(service, 'findAll').mockResolvedValue([]);

      const result = await controller.findAll();

      expect(result).toEqual([]);
      expect(findAllSpy).toHaveBeenCalled();
    });

    it('should return senders with different enabled states', async () => {
      const senders = [
        { ...mockThirdPartySender, enabled: true },
        { ...mockThirdPartySender2, enabled: false },
      ] as ThirdPartySender[];

      const findAllSpy = jest
        .spyOn(service, 'findAll')
        .mockResolvedValue(senders);

      const result = await controller.findAll();

      expect(result[0].enabled).toBe(true);
      expect(result[1].enabled).toBe(false);
      expect(findAllSpy).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a single third-party sender by id', async () => {
      const senderId = '123e4567-e89b-12d3-a456-426614174000';

      const findOneSpy = jest
        .spyOn(service, 'findOne')
        .mockResolvedValue(mockThirdPartySender);

      const result = await controller.findOne(senderId);

      expect(result).toEqual(mockThirdPartySender);
      expect(result.id).toBe(senderId);
      expect(findOneSpy).toHaveBeenCalledWith(senderId);
    });

    it('should return sender with all properties', async () => {
      const findOneSpy = jest
        .spyOn(service, 'findOne')
        .mockResolvedValue(mockThirdPartySender);

      const result = await controller.findOne('test-id');

      expect(result.name).toBe('Google Workspace');
      expect(result.dkimPattern).toBe('.*\\.google\\.com$');
      expect(result.spfPattern).toBe('^172\\.253\\.');
      expect(result.description).toBe(
        'Google Workspace email forwarding service',
      );
      expect(result.enabled).toBe(true);
      expect(findOneSpy).toHaveBeenCalled();
    });

    it('should handle different sender configurations', async () => {
      const senderWithoutSPF = {
        ...mockThirdPartySender,
        spfPattern: undefined,
      } as ThirdPartySender;

      const findOneSpy = jest
        .spyOn(service, 'findOne')
        .mockResolvedValue(senderWithoutSPF);

      const result = await controller.findOne('test-id');

      expect(result.spfPattern).toBeUndefined();
      expect(findOneSpy).toHaveBeenCalledWith('test-id');
    });
  });

  describe('create', () => {
    it('should create a new third-party sender', async () => {
      const createDto: CreateThirdPartySenderDto = {
        name: 'Google Workspace',
        dkimPattern: '.*\\.google\\.com$',
        spfPattern: '^172\\.253\\.',
        description: 'Google Workspace email forwarding service',
        enabled: true,
      };

      const createSpy = jest
        .spyOn(service, 'create')
        .mockResolvedValue(mockThirdPartySender);

      const result = await controller.create(createDto);

      expect(result).toEqual(mockThirdPartySender);
      expect(createSpy).toHaveBeenCalledWith(createDto);
    });

    it('should create sender with minimal required fields', async () => {
      const createDto: CreateThirdPartySenderDto = {
        name: 'Minimal Sender',
        dkimPattern: '.*\\.example\\.com$',
      };

      const minimalSender = {
        id: 'new-id',
        name: 'Minimal Sender',
        dkimPattern: '.*\\.example\\.com$',
        spfPattern: undefined,
        description: undefined,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        matchesDkim: jest.fn(),
        matchesSpf: jest.fn(),
      } as ThirdPartySender;

      const createSpy = jest
        .spyOn(service, 'create')
        .mockResolvedValue(minimalSender);

      const result = await controller.create(createDto);

      expect(result.name).toBe('Minimal Sender');
      expect(result.dkimPattern).toBe('.*\\.example\\.com$');
      expect(createSpy).toHaveBeenCalledWith(createDto);
    });

    it('should create sender with DKIM pattern only', async () => {
      const createDto: CreateThirdPartySenderDto = {
        name: 'DKIM Only',
        dkimPattern: '.*\\.domain\\.com$',
        spfPattern: undefined,
      };

      const sender = {
        ...mockThirdPartySender,
        name: 'DKIM Only',
        dkimPattern: '.*\\.domain\\.com$',
        spfPattern: undefined,
      } as ThirdPartySender;

      const createSpy = jest.spyOn(service, 'create').mockResolvedValue(sender);

      const result = await controller.create(createDto);

      expect(result.spfPattern).toBeUndefined();
      expect(createSpy).toHaveBeenCalledWith(createDto);
    });

    it('should create sender with SPF pattern only', async () => {
      const createDto: CreateThirdPartySenderDto = {
        name: 'SPF Only',
        dkimPattern: undefined,
        spfPattern: '^10\\.',
      };

      const sender = {
        ...mockThirdPartySender,
        name: 'SPF Only',
        dkimPattern: undefined,
        spfPattern: '^10\\.',
      } as ThirdPartySender;

      jest.spyOn(service, 'create').mockResolvedValue(sender);

      const result = await controller.create(createDto);

      expect(result.dkimPattern).toBeUndefined();
      expect(result.spfPattern).toBe('^10\\.');
    });

    it('should create disabled sender', async () => {
      const createDto: CreateThirdPartySenderDto = {
        name: 'Disabled Sender',
        dkimPattern: '.*\\.disabled\\.com$',
        enabled: false,
      };

      const disabledSender = {
        ...mockThirdPartySender,
        name: 'Disabled Sender',
        dkimPattern: '.*\\.disabled\\.com$',
        enabled: false,
      } as ThirdPartySender;

      const createSpy = jest
        .spyOn(service, 'create')
        .mockResolvedValue(disabledSender);

      const result = await controller.create(createDto);

      expect(result.enabled).toBe(false);
      expect(createSpy).toHaveBeenCalledWith(createDto);
    });
  });

  describe('update', () => {
    it('should update an existing third-party sender', async () => {
      const senderId = '123e4567-e89b-12d3-a456-426614174000';
      const updateDto: UpdateThirdPartySenderDto = {
        name: 'Updated Google Workspace',
        description: 'Updated description',
      };

      const updatedSender = {
        ...mockThirdPartySender,
        name: 'Updated Google Workspace',
        description: 'Updated description',
        updatedAt: new Date('2025-01-05T10:00:00Z'),
      } as ThirdPartySender;

      const updateSpy = jest
        .spyOn(service, 'update')
        .mockResolvedValue(updatedSender);

      const result = await controller.update(senderId, updateDto);

      expect(result).toEqual(updatedSender);
      expect(result.name).toBe('Updated Google Workspace');
      expect(updateSpy).toHaveBeenCalledWith(senderId, updateDto);
    });

    it('should update only DKIM pattern', async () => {
      const updateDto: UpdateThirdPartySenderDto = {
        dkimPattern: '.*\\.newdomain\\.com$',
      };

      const updatedSender = {
        ...mockThirdPartySender,
        dkimPattern: '.*\\.newdomain\\.com$',
      } as ThirdPartySender;

      const updateSpy = jest
        .spyOn(service, 'update')
        .mockResolvedValue(updatedSender);

      const result = await controller.update('test-id', updateDto);

      expect(result.dkimPattern).toBe('.*\\.newdomain\\.com$');
      expect(updateSpy).toHaveBeenCalledWith('test-id', updateDto);
    });

    it('should update only SPF pattern', async () => {
      const updateDto: UpdateThirdPartySenderDto = {
        spfPattern: '^192\\.168\\.',
      };

      const updatedSender = {
        ...mockThirdPartySender,
        spfPattern: '^192\\.168\\.',
      } as ThirdPartySender;

      const updateSpy = jest
        .spyOn(service, 'update')
        .mockResolvedValue(updatedSender);

      const result = await controller.update('test-id', updateDto);

      expect(result.spfPattern).toBe('^192\\.168\\.');
      expect(updateSpy).toHaveBeenCalledWith('test-id', updateDto);
    });

    it('should toggle enabled status', async () => {
      const updateDto: UpdateThirdPartySenderDto = {
        enabled: false,
      };

      const updatedSender = {
        ...mockThirdPartySender,
        enabled: false,
      } as ThirdPartySender;

      const updateSpy = jest
        .spyOn(service, 'update')
        .mockResolvedValue(updatedSender);

      const result = await controller.update('test-id', updateDto);

      expect(result.enabled).toBe(false);
      expect(updateSpy).toHaveBeenCalledWith('test-id', updateDto);
    });

    it('should update multiple fields at once', async () => {
      const updateDto: UpdateThirdPartySenderDto = {
        name: 'New Name',
        dkimPattern: '.*\\.new\\.com$',
        spfPattern: '^1\\.2\\.3\\.',
        description: 'New description',
        enabled: false,
      };

      const updatedSender = {
        ...mockThirdPartySender,
        ...updateDto,
      } as ThirdPartySender;

      const updateSpy = jest
        .spyOn(service, 'update')
        .mockResolvedValue(updatedSender);

      const result = await controller.update('test-id', updateDto);

      expect(result.name).toBe('New Name');
      expect(result.dkimPattern).toBe('.*\\.new\\.com$');
      expect(result.spfPattern).toBe('^1\\.2\\.3\\.');
      expect(result.description).toBe('New description');
      expect(result.enabled).toBe(false);
      expect(updateSpy).toHaveBeenCalledWith('test-id', updateDto);
    });

    it('should clear optional fields with undefined', async () => {
      const updateDto: UpdateThirdPartySenderDto = {
        spfPattern: undefined,
        description: undefined,
      };

      const updatedSender = {
        ...mockThirdPartySender,
        spfPattern: undefined,
        description: undefined,
      } as ThirdPartySender;

      jest.spyOn(service, 'update').mockResolvedValue(updatedSender);

      const result = await controller.update('test-id', updateDto);

      expect(result.spfPattern).toBeUndefined();
      expect(result.description).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('should delete a third-party sender', async () => {
      const senderId = '123e4567-e89b-12d3-a456-426614174000';

      const deleteSpy = jest
        .spyOn(service, 'delete')
        .mockResolvedValue(undefined);

      const result = await controller.delete(senderId);

      expect(result).toBeUndefined();
      expect(deleteSpy).toHaveBeenCalledWith(senderId);
    });

    it('should call service delete with correct id', async () => {
      const senderId = 'test-delete-id';

      const deleteSpy = jest
        .spyOn(service, 'delete')
        .mockResolvedValue(undefined);

      await controller.delete(senderId);

      expect(deleteSpy).toHaveBeenCalledWith(senderId);
      expect(deleteSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle deletion of multiple senders sequentially', async () => {
      const senderIds = ['id-1', 'id-2', 'id-3'];

      const deleteSpy = jest
        .spyOn(service, 'delete')
        .mockResolvedValue(undefined);

      for (const id of senderIds) {
        await controller.delete(id);
      }

      expect(deleteSpy).toHaveBeenCalledTimes(3);
      expect(deleteSpy).toHaveBeenNthCalledWith(1, 'id-1');
      expect(deleteSpy).toHaveBeenNthCalledWith(2, 'id-2');
      expect(deleteSpy).toHaveBeenNthCalledWith(3, 'id-3');
    });
  });
});
