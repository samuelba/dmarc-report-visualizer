import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Domain } from './entities/domain.entity';
import {
  CreateDomainDto,
  UpdateDomainDto,
  DomainStatisticsDto,
} from './dto/domain.dto';
import { DmarcReport } from './entities/dmarc-report.entity';
import { DmarcRecord } from './entities/dmarc-record.entity';

@Injectable()
export class DomainService {
  constructor(
    @InjectRepository(Domain)
    private domainRepository: Repository<Domain>,
    @InjectRepository(DmarcReport)
    private dmarcReportRepository: Repository<DmarcReport>,
    @InjectRepository(DmarcRecord)
    private dmarcRecordRepository: Repository<DmarcRecord>,
  ) {}

  /**
   * Create a new managed domain
   */
  async create(createDomainDto: CreateDomainDto): Promise<Domain> {
    // Check if domain already exists
    const existing = await this.domainRepository.findOne({
      where: { domain: createDomainDto.domain },
    });

    if (existing) {
      throw new ConflictException('Domain already exists');
    }

    const domain = this.domainRepository.create(createDomainDto);
    return this.domainRepository.save(domain);
  }

  /**
   * Get all managed domains
   */
  async findAll(): Promise<Domain[]> {
    return this.domainRepository.find({
      order: { domain: 'ASC' },
    });
  }

  /**
   * Get a specific domain by ID
   */
  async findOne(id: string): Promise<Domain> {
    const domain = await this.domainRepository.findOne({ where: { id } });
    if (!domain) {
      throw new NotFoundException(`Domain with ID ${id} not found`);
    }
    return domain;
  }

  /**
   * Update a domain
   */
  async update(id: string, updateDomainDto: UpdateDomainDto): Promise<Domain> {
    const domain = await this.findOne(id);
    // Convert empty string notes to null to clear the field
    if (updateDomainDto.notes !== undefined) {
      domain.notes = updateDomainDto.notes?.trim() || null;
    }
    return this.domainRepository.save(domain);
  }

  /**
   * Delete a domain
   */
  async remove(id: string): Promise<void> {
    const domain = await this.findOne(id);
    await this.domainRepository.remove(domain);
  }

  /**
   * Get statistics for all domains (managed and unmanaged) for a given time period
   */
  async getDomainStatistics(
    daysBack: number = 30,
  ): Promise<DomainStatisticsDto[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    // Get all managed domains
    const managedDomains = await this.domainRepository.find();
    const managedDomainsMap = new Map(
      managedDomains.map((d) => [d.domain.toLowerCase(), d]),
    );

    // Get statistics for all domains that appear in DMARC reports
    const stats = await this.dmarcRecordRepository
      .createQueryBuilder('record')
      .select('LOWER(report.domain)', 'domain')
      .addSelect('COUNT(DISTINCT record.sourceIp)', 'uniqueSources')
      .addSelect('SUM(record.count)', 'totalMessages')
      .addSelect(
        `SUM(CASE WHEN record.dmarcDkim = 'pass' OR record.dmarcSpf = 'pass' THEN record.count ELSE 0 END)`,
        'passedMessages',
      )
      .addSelect(
        `SUM(CASE WHEN record.dmarcDkim = 'fail' AND record.dmarcSpf = 'fail' THEN record.count ELSE 0 END)`,
        'failedMessages',
      )
      .addSelect(
        `SUM(CASE WHEN record.dmarcSpf = 'pass' THEN record.count ELSE 0 END)`,
        'spfPassed',
      )
      .addSelect(
        `SUM(CASE WHEN record.dmarcDkim = 'pass' THEN record.count ELSE 0 END)`,
        'dkimPassed',
      )
      .innerJoin('record.report', 'report')
      .where('report.beginDate >= :cutoffDate', { cutoffDate })
      .groupBy('LOWER(report.domain)')
      .getRawMany();

    // Create result array combining managed and unmanaged domains
    const resultMap = new Map<string, DomainStatisticsDto>();

    // First, add all managed domains (even if they have no stats)
    for (const [domainLower, domain] of managedDomainsMap) {
      resultMap.set(domainLower, {
        id: domain.id,
        domain: domain.domain,
        isManaged: true,
        totalMessages: 0,
        passedMessages: 0,
        failedMessages: 0,
        dmarcPassRate: 0,
        spfPassRate: 0,
        dkimPassRate: 0,
        uniqueSources: 0,
        notes: domain.notes,
        createdAt: domain.createdAt,
        updatedAt: domain.updatedAt,
      });
    }

    // Then, add or update with actual statistics
    for (const stat of stats) {
      const domainLower = stat.domain.toLowerCase();
      const totalMessages = parseInt(stat.totalMessages) || 0;
      const passedMessages = parseInt(stat.passedMessages) || 0;
      const failedMessages = parseInt(stat.failedMessages) || 0;
      const spfPassed = parseInt(stat.spfPassed) || 0;
      const dkimPassed = parseInt(stat.dkimPassed) || 0;
      const uniqueSources = parseInt(stat.uniqueSources) || 0;

      const isManaged = managedDomainsMap.has(domainLower);
      const managedDomain = managedDomainsMap.get(domainLower);

      const dmarcPassRate =
        totalMessages > 0 ? (passedMessages / totalMessages) * 100 : 0;
      const spfPassRate =
        totalMessages > 0 ? (spfPassed / totalMessages) * 100 : 0;
      const dkimPassRate =
        totalMessages > 0 ? (dkimPassed / totalMessages) * 100 : 0;

      resultMap.set(domainLower, {
        id: managedDomain?.id,
        domain: stat.domain,
        isManaged,
        totalMessages,
        passedMessages,
        failedMessages,
        dmarcPassRate: Math.round(dmarcPassRate * 100) / 100,
        spfPassRate: Math.round(spfPassRate * 100) / 100,
        dkimPassRate: Math.round(dkimPassRate * 100) / 100,
        uniqueSources,
        notes: managedDomain?.notes,
        createdAt: managedDomain?.createdAt,
        updatedAt: managedDomain?.updatedAt,
      });
    }

    // Convert map to array and sort
    return Array.from(resultMap.values()).sort((a, b) => {
      // Sort managed domains first, then by domain name
      if (a.isManaged !== b.isManaged) {
        return a.isManaged ? -1 : 1;
      }
      return a.domain.localeCompare(b.domain);
    });
  }
}
