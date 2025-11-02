import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SelectQueryBuilder } from 'typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DomainService } from './domain.service';
import { Domain } from './entities/domain.entity';
import { DmarcReport } from './entities/dmarc-report.entity';
import { DmarcRecord } from './entities/dmarc-record.entity';
import { CreateDomainDto, UpdateDomainDto } from './dto/domain.dto';

describe('DomainService', () => {
  let service: DomainService;

  const mockDomainRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };

  const mockDmarcReportRepository = {
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockDmarcRecordRepository = {
    createQueryBuilder: jest.fn(),
  };

  // Helper functions to create fresh mock objects
  const createMockDomain = (): Domain => ({
    id: '123e4567-e89b-12d3-a456-426614174000',
    domain: 'example.com',
    notes: 'Test notes',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
  });

  const createMockDomainWithoutNotes = (): Domain => ({
    id: '123e4567-e89b-12d3-a456-426614174001',
    domain: 'test.com',
    notes: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DomainService,
        {
          provide: getRepositoryToken(Domain),
          useValue: mockDomainRepository,
        },
        {
          provide: getRepositoryToken(DmarcReport),
          useValue: mockDmarcReportRepository,
        },
        {
          provide: getRepositoryToken(DmarcRecord),
          useValue: mockDmarcRecordRepository,
        },
      ],
    }).compile();

    service = module.get<DomainService>(DomainService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new domain with notes', async () => {
      const createDto: CreateDomainDto = {
        domain: 'example.com',
        notes: 'Test notes',
      };
      const mockDomain = createMockDomain();

      mockDomainRepository.findOne.mockResolvedValue(null);
      mockDomainRepository.create.mockReturnValue(mockDomain);
      mockDomainRepository.save.mockResolvedValue(mockDomain);

      const result = await service.create(createDto);

      expect(result).toEqual(mockDomain);
      expect(mockDomainRepository.findOne).toHaveBeenCalledWith({
        where: { domain: createDto.domain },
      });
      expect(mockDomainRepository.create).toHaveBeenCalledWith(createDto);
      expect(mockDomainRepository.save).toHaveBeenCalledWith(mockDomain);
    });

    it('should create a new domain without notes', async () => {
      const createDto: CreateDomainDto = {
        domain: 'test.com',
      };
      const mockDomainWithoutNotes = createMockDomainWithoutNotes();

      mockDomainRepository.findOne.mockResolvedValue(null);
      mockDomainRepository.create.mockReturnValue(mockDomainWithoutNotes);
      mockDomainRepository.save.mockResolvedValue(mockDomainWithoutNotes);

      const result = await service.create(createDto);

      expect(result).toEqual(mockDomainWithoutNotes);
      expect(mockDomainRepository.findOne).toHaveBeenCalledWith({
        where: { domain: createDto.domain },
      });
    });

    it('should throw ConflictException if domain already exists', async () => {
      const createDto: CreateDomainDto = {
        domain: 'example.com',
      };
      const mockDomain = createMockDomain();

      mockDomainRepository.findOne.mockResolvedValue(mockDomain);

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.create(createDto)).rejects.toThrow(
        'Domain already exists',
      );
      expect(mockDomainRepository.findOne).toHaveBeenCalledWith({
        where: { domain: createDto.domain },
      });
      expect(mockDomainRepository.create).not.toHaveBeenCalled();
      expect(mockDomainRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return all domains sorted by domain name', async () => {
      const mockDomain = createMockDomain();
      const mockDomainWithoutNotes = createMockDomainWithoutNotes();
      const mockDomains = [mockDomain, mockDomainWithoutNotes];
      mockDomainRepository.find.mockResolvedValue(mockDomains);

      const result = await service.findAll();

      expect(result).toEqual(mockDomains);
      expect(mockDomainRepository.find).toHaveBeenCalledWith({
        order: { domain: 'ASC' },
      });
      expect(mockDomainRepository.find).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no domains exist', async () => {
      mockDomainRepository.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
      expect(mockDomainRepository.find).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOne', () => {
    it('should return a domain by id', async () => {
      const id = '123e4567-e89b-12d3-a456-426614174000';
      const mockDomain = createMockDomain();
      mockDomainRepository.findOne.mockResolvedValue(mockDomain);

      const result = await service.findOne(id);

      expect(result).toEqual(mockDomain);
      expect(mockDomainRepository.findOne).toHaveBeenCalledWith({
        where: { id },
      });
    });

    it('should throw NotFoundException when domain not found', async () => {
      const id = '123e4567-e89b-12d3-a456-426614174999';
      mockDomainRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(id)).rejects.toThrow(NotFoundException);
      await expect(service.findOne(id)).rejects.toThrow(
        `Domain with ID ${id} not found`,
      );
      expect(mockDomainRepository.findOne).toHaveBeenCalledWith({
        where: { id },
      });
    });
  });

  describe('update', () => {
    it('should update domain notes', async () => {
      const id = '123e4567-e89b-12d3-a456-426614174000';
      const updateDto: UpdateDomainDto = {
        notes: 'Updated notes',
      };
      const mockDomain = createMockDomain();
      const updatedDomain = { ...mockDomain, notes: 'Updated notes' };

      mockDomainRepository.findOne.mockResolvedValue(mockDomain);
      mockDomainRepository.save.mockResolvedValue(updatedDomain);

      const result = await service.update(id, updateDto);

      expect(result).toEqual(updatedDomain);
      expect(mockDomainRepository.findOne).toHaveBeenCalledWith({
        where: { id },
      });
      expect(mockDomainRepository.save).toHaveBeenCalled();
    });

    it('should clear domain notes when empty string is provided', async () => {
      const id = '123e4567-e89b-12d3-a456-426614174000';
      const updateDto: UpdateDomainDto = {
        notes: '',
      };
      const domainToUpdate = createMockDomain();

      mockDomainRepository.findOne.mockResolvedValue(domainToUpdate);
      mockDomainRepository.save.mockImplementation((domain) => {
        return Promise.resolve({ ...domain, notes: null } as Domain);
      });

      const result = await service.update(id, updateDto);

      expect(result.notes).toBeNull();
      expect(mockDomainRepository.findOne).toHaveBeenCalledWith({
        where: { id },
      });
      expect(mockDomainRepository.save).toHaveBeenCalled();
    });

    it('should clear domain notes when whitespace string is provided', async () => {
      const id = '123e4567-e89b-12d3-a456-426614174000';
      const updateDto: UpdateDomainDto = {
        notes: '   ',
      };
      const domainToUpdate = createMockDomain();

      mockDomainRepository.findOne.mockResolvedValue(domainToUpdate);
      mockDomainRepository.save.mockImplementation((domain) => {
        return Promise.resolve({ ...domain, notes: null } as Domain);
      });

      const result = await service.update(id, updateDto);

      expect(result.notes).toBeNull();
      expect(mockDomainRepository.save).toHaveBeenCalled();
    });

    it('should not update notes if undefined', async () => {
      const id = '123e4567-e89b-12d3-a456-426614174000';
      const updateDto: UpdateDomainDto = {};
      const mockDomain = createMockDomain();

      mockDomainRepository.findOne.mockResolvedValue(mockDomain);
      mockDomainRepository.save.mockResolvedValue(mockDomain);

      const result = await service.update(id, updateDto);

      expect(result.notes).toBe('Test notes');
      expect(mockDomainRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when updating non-existent domain', async () => {
      const id = '123e4567-e89b-12d3-a456-426614174999';
      const updateDto: UpdateDomainDto = {
        notes: 'Test',
      };

      mockDomainRepository.findOne.mockResolvedValue(null);

      await expect(service.update(id, updateDto)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockDomainRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should delete a domain', async () => {
      const id = '123e4567-e89b-12d3-a456-426614174000';
      const mockDomain = createMockDomain();
      mockDomainRepository.findOne.mockResolvedValue(mockDomain);
      mockDomainRepository.remove.mockResolvedValue(mockDomain);

      await service.remove(id);

      expect(mockDomainRepository.findOne).toHaveBeenCalledWith({
        where: { id },
      });
      expect(mockDomainRepository.remove).toHaveBeenCalledWith(mockDomain);
    });

    it('should throw NotFoundException when deleting non-existent domain', async () => {
      const id = '123e4567-e89b-12d3-a456-426614174999';
      mockDomainRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(id)).rejects.toThrow(NotFoundException);
      expect(mockDomainRepository.remove).not.toHaveBeenCalled();
    });
  });

  describe('getDomainStatistics', () => {
    const mockQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(),
    } as unknown as SelectQueryBuilder<DmarcRecord>;

    beforeEach(() => {
      mockDmarcRecordRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder,
      );
    });

    it('should return statistics for managed and unmanaged domains', async () => {
      const mockManagedDomains = [createMockDomain()];
      const mockStats = [
        {
          domain: 'example.com',
          uniqueSources: '10',
          totalMessages: '1000',
          passedMessages: '950',
          failedMessages: '50',
          spfPassed: '980',
          dkimPassed: '960',
        },
        {
          domain: 'unknown.com',
          uniqueSources: '5',
          totalMessages: '500',
          passedMessages: '400',
          failedMessages: '100',
          spfPassed: '425',
          dkimPassed: '410',
        },
      ];

      mockDomainRepository.find.mockResolvedValue(mockManagedDomains);
      (mockQueryBuilder.getRawMany as jest.Mock).mockResolvedValue(mockStats);

      const result = await service.getDomainStatistics(30);

      expect(result).toHaveLength(2);

      // Check managed domain
      const managedDomain = result.find((d) => d.domain === 'example.com');
      expect(managedDomain).toBeDefined();
      expect(managedDomain?.isManaged).toBe(true);
      expect(managedDomain?.totalMessages).toBe(1000);
      expect(managedDomain?.passedMessages).toBe(950);
      expect(managedDomain?.failedMessages).toBe(50);
      expect(managedDomain?.uniqueSources).toBe(10);
      expect(managedDomain?.notes).toBe('Test notes');

      // Check unmanaged domain
      const unmanagedDomain = result.find((d) => d.domain === 'unknown.com');
      expect(unmanagedDomain).toBeDefined();
      expect(unmanagedDomain?.isManaged).toBe(false);
      expect(unmanagedDomain?.totalMessages).toBe(500);
      expect(unmanagedDomain?.notes).toBeUndefined();

      expect(mockDomainRepository.find).toHaveBeenCalledTimes(1);
      expect(mockDmarcRecordRepository.createQueryBuilder).toHaveBeenCalledWith(
        'record',
      );
    });

    it('should return managed domains with zero stats when no DMARC data exists', async () => {
      const mockManagedDomains = [createMockDomain()];
      mockDomainRepository.find.mockResolvedValue(mockManagedDomains);
      (mockQueryBuilder.getRawMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getDomainStatistics(30);

      expect(result).toHaveLength(1);
      expect(result[0].domain).toBe('example.com');
      expect(result[0].isManaged).toBe(true);
      expect(result[0].totalMessages).toBe(0);
      expect(result[0].passedMessages).toBe(0);
      expect(result[0].failedMessages).toBe(0);
      expect(result[0].dmarcPassRate).toBe(0);
      expect(result[0].spfPassRate).toBe(0);
      expect(result[0].dkimPassRate).toBe(0);
      expect(result[0].notes).toBe('Test notes');
    });

    it('should calculate pass rates correctly', async () => {
      const mockManagedDomains = [createMockDomain()];
      const mockStats = [
        {
          domain: 'example.com',
          uniqueSources: '10',
          totalMessages: '1000',
          passedMessages: '950',
          failedMessages: '50',
          spfPassed: '980',
          dkimPassed: '960',
        },
      ];

      mockDomainRepository.find.mockResolvedValue(mockManagedDomains);
      (mockQueryBuilder.getRawMany as jest.Mock).mockResolvedValue(mockStats);

      const result = await service.getDomainStatistics(30);

      expect(result).toHaveLength(1);
      expect(result[0].dmarcPassRate).toBe(95.0);
      expect(result[0].spfPassRate).toBe(98.0);
      expect(result[0].dkimPassRate).toBe(96.0);
    });

    it('should use custom daysBack parameter', async () => {
      mockDomainRepository.find.mockResolvedValue([]);
      (mockQueryBuilder.getRawMany as jest.Mock).mockResolvedValue([]);

      await service.getDomainStatistics(7);

      const whereSpy = mockQueryBuilder.where;
      expect(whereSpy).toHaveBeenCalledWith(
        'report.beginDate >= :cutoffDate',
        expect.objectContaining({ cutoffDate: expect.any(Date) }),
      );
    });

    it('should sort results with managed domains first', async () => {
      const mockManagedDomains = [createMockDomain()];
      const mockStats = [
        {
          domain: 'zzz-unmanaged.com',
          uniqueSources: '5',
          totalMessages: '500',
          passedMessages: '400',
          failedMessages: '100',
          spfPassed: '425',
          dkimPassed: '410',
        },
        {
          domain: 'example.com',
          uniqueSources: '10',
          totalMessages: '1000',
          passedMessages: '950',
          failedMessages: '50',
          spfPassed: '980',
          dkimPassed: '960',
        },
        {
          domain: 'aaa-unmanaged.com',
          uniqueSources: '3',
          totalMessages: '300',
          passedMessages: '250',
          failedMessages: '50',
          spfPassed: '270',
          dkimPassed: '260',
        },
      ];

      mockDomainRepository.find.mockResolvedValue(mockManagedDomains);
      (mockQueryBuilder.getRawMany as jest.Mock).mockResolvedValue(mockStats);

      const result = await service.getDomainStatistics(30);

      expect(result).toHaveLength(3);
      // Managed domain should be first
      expect(result[0].domain).toBe('example.com');
      expect(result[0].isManaged).toBe(true);
      // Unmanaged domains should be sorted alphabetically
      expect(result[1].domain).toBe('aaa-unmanaged.com');
      expect(result[1].isManaged).toBe(false);
      expect(result[2].domain).toBe('zzz-unmanaged.com');
      expect(result[2].isManaged).toBe(false);
    });

    it('should handle case-insensitive domain matching', async () => {
      const mockManagedDomain: Domain = {
        ...createMockDomain(),
        domain: 'Example.COM',
      };
      const mockStats = [
        {
          domain: 'example.com',
          uniqueSources: '10',
          totalMessages: '1000',
          passedMessages: '950',
          failedMessages: '50',
          spfPassed: '980',
          dkimPassed: '960',
        },
      ];

      mockDomainRepository.find.mockResolvedValue([mockManagedDomain]);
      (mockQueryBuilder.getRawMany as jest.Mock).mockResolvedValue(mockStats);

      const result = await service.getDomainStatistics(30);

      expect(result).toHaveLength(1);
      expect(result[0].isManaged).toBe(true);
      expect(result[0].domain).toBe('example.com');
    });

    it('should return empty array when no domains exist', async () => {
      mockDomainRepository.find.mockResolvedValue([]);
      (mockQueryBuilder.getRawMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getDomainStatistics(30);

      expect(result).toEqual([]);
    });
  });
});
