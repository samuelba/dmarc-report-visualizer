import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DomainController } from './domain.controller';
import { DomainService } from './domain.service';
import { Domain } from './entities/domain.entity';
import {
  CreateDomainDto,
  UpdateDomainDto,
  DomainStatisticsDto,
} from './dto/domain.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('DomainController', () => {
  let controller: DomainController;

  const mockDomainService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getDomainStatistics: jest.fn(),
  };

  const mockDomain: Domain = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    domain: 'example.com',
    notes: 'Test notes',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
  };

  const mockDomainWithoutNotes: Domain = {
    id: '123e4567-e89b-12d3-a456-426614174001',
    domain: 'test.com',
    notes: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DomainController],
      providers: [
        {
          provide: DomainService,
          useValue: mockDomainService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DomainController>(DomainController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a new domain with notes', async () => {
      const createDto: CreateDomainDto = {
        domain: 'example.com',
        notes: 'Test notes',
      };

      mockDomainService.create.mockResolvedValue(mockDomain);

      const result = await controller.create(createDto);

      expect(result).toEqual(mockDomain);
      expect(mockDomainService.create).toHaveBeenCalledWith(createDto);
      expect(mockDomainService.create).toHaveBeenCalledTimes(1);
    });

    it('should create a new domain without notes', async () => {
      const createDto: CreateDomainDto = {
        domain: 'test.com',
      };

      mockDomainService.create.mockResolvedValue(mockDomainWithoutNotes);

      const result = await controller.create(createDto);

      expect(result).toEqual(mockDomainWithoutNotes);
      expect(mockDomainService.create).toHaveBeenCalledWith(createDto);
    });

    it('should throw ConflictException when domain already exists', async () => {
      const createDto: CreateDomainDto = {
        domain: 'existing.com',
      };

      mockDomainService.create.mockRejectedValue(
        new ConflictException('Domain already exists'),
      );

      await expect(controller.create(createDto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockDomainService.create).toHaveBeenCalledWith(createDto);
    });
  });

  describe('findAll', () => {
    it('should return an array of domains', async () => {
      const mockDomains = [mockDomain, mockDomainWithoutNotes];
      mockDomainService.findAll.mockResolvedValue(mockDomains);

      const result = await controller.findAll();

      expect(result).toEqual(mockDomains);
      expect(mockDomainService.findAll).toHaveBeenCalledTimes(1);
    });

    it('should return an empty array when no domains exist', async () => {
      mockDomainService.findAll.mockResolvedValue([]);

      const result = await controller.findAll();

      expect(result).toEqual([]);
      expect(mockDomainService.findAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('getStatistics', () => {
    const mockStatistics: DomainStatisticsDto[] = [
      {
        id: '123e4567-e89b-12d3-a456-426614174000',
        domain: 'example.com',
        isManaged: true,
        totalMessages: 1000,
        passedMessages: 950,
        failedMessages: 50,
        dmarcPassRate: 95.0,
        spfPassRate: 98.0,
        dkimPassRate: 96.0,
        uniqueSources: 10,
        notes: 'Test notes',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      },
      {
        domain: 'unknown.com',
        isManaged: false,
        totalMessages: 500,
        passedMessages: 400,
        failedMessages: 100,
        dmarcPassRate: 80.0,
        spfPassRate: 85.0,
        dkimPassRate: 82.0,
        uniqueSources: 5,
      },
    ];

    it('should return domain statistics with default daysBack', async () => {
      mockDomainService.getDomainStatistics.mockResolvedValue(mockStatistics);

      const result = await controller.getStatistics({});

      expect(result).toEqual(mockStatistics);
      expect(mockDomainService.getDomainStatistics).toHaveBeenCalledWith(30);
      expect(mockDomainService.getDomainStatistics).toHaveBeenCalledTimes(1);
    });

    it('should return domain statistics with custom daysBack', async () => {
      mockDomainService.getDomainStatistics.mockResolvedValue(mockStatistics);

      const result = await controller.getStatistics({ daysBack: 7 });

      expect(result).toEqual(mockStatistics);
      expect(mockDomainService.getDomainStatistics).toHaveBeenCalledWith(7);
    });

    it('should return domain statistics with daysBack as 90', async () => {
      mockDomainService.getDomainStatistics.mockResolvedValue(mockStatistics);

      const result = await controller.getStatistics({ daysBack: 90 });

      expect(result).toEqual(mockStatistics);
      expect(mockDomainService.getDomainStatistics).toHaveBeenCalledWith(90);
    });

    it('should return empty array when no domains have data', async () => {
      mockDomainService.getDomainStatistics.mockResolvedValue([]);

      const result = await controller.getStatistics({});

      expect(result).toEqual([]);
      expect(mockDomainService.getDomainStatistics).toHaveBeenCalledWith(30);
    });
  });

  describe('findOne', () => {
    it('should return a domain by id', async () => {
      const id = '123e4567-e89b-12d3-a456-426614174000';
      mockDomainService.findOne.mockResolvedValue(mockDomain);

      const result = await controller.findOne(id);

      expect(result).toEqual(mockDomain);
      expect(mockDomainService.findOne).toHaveBeenCalledWith(id);
      expect(mockDomainService.findOne).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when domain not found', async () => {
      const id = '123e4567-e89b-12d3-a456-426614174999';
      mockDomainService.findOne.mockRejectedValue(
        new NotFoundException(`Domain with ID ${id} not found`),
      );

      await expect(controller.findOne(id)).rejects.toThrow(NotFoundException);
      expect(mockDomainService.findOne).toHaveBeenCalledWith(id);
    });
  });

  describe('update', () => {
    it('should update domain notes', async () => {
      const id = '123e4567-e89b-12d3-a456-426614174000';
      const updateDto: UpdateDomainDto = {
        notes: 'Updated notes',
      };
      const updatedDomain = { ...mockDomain, notes: 'Updated notes' };

      mockDomainService.update.mockResolvedValue(updatedDomain);

      const result = await controller.update(id, updateDto);

      expect(result).toEqual(updatedDomain);
      expect(mockDomainService.update).toHaveBeenCalledWith(id, updateDto);
      expect(mockDomainService.update).toHaveBeenCalledTimes(1);
    });

    it('should clear domain notes (set to null)', async () => {
      const id = '123e4567-e89b-12d3-a456-426614174000';
      const updateDto: UpdateDomainDto = {
        notes: '',
      };
      const updatedDomain = { ...mockDomain, notes: null };

      mockDomainService.update.mockResolvedValue(updatedDomain);

      const result = await controller.update(id, updateDto);

      expect(result.notes).toBeNull();
      expect(mockDomainService.update).toHaveBeenCalledWith(id, updateDto);
    });

    it('should throw NotFoundException when updating non-existent domain', async () => {
      const id = '123e4567-e89b-12d3-a456-426614174999';
      const updateDto: UpdateDomainDto = {
        notes: 'Test',
      };

      mockDomainService.update.mockRejectedValue(
        new NotFoundException(`Domain with ID ${id} not found`),
      );

      await expect(controller.update(id, updateDto)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockDomainService.update).toHaveBeenCalledWith(id, updateDto);
    });
  });

  describe('remove', () => {
    it('should delete a domain', async () => {
      const id = '123e4567-e89b-12d3-a456-426614174000';
      mockDomainService.remove.mockResolvedValue(undefined);

      const result = await controller.remove(id);

      expect(result).toEqual({ message: 'Domain deleted successfully' });
      expect(mockDomainService.remove).toHaveBeenCalledWith(id);
      expect(mockDomainService.remove).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when deleting non-existent domain', async () => {
      const id = '123e4567-e89b-12d3-a456-426614174999';
      mockDomainService.remove.mockRejectedValue(
        new NotFoundException(`Domain with ID ${id} not found`),
      );

      await expect(controller.remove(id)).rejects.toThrow(NotFoundException);
      expect(mockDomainService.remove).toHaveBeenCalledWith(id);
    });
  });
});
