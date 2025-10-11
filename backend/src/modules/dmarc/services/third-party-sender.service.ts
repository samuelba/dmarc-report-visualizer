import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ThirdPartySender } from '../entities/third-party-sender.entity';

export interface CreateThirdPartySenderDto {
  name: string;
  description?: string;
  dkimPattern?: string;
  spfPattern?: string;
  enabled?: boolean;
}

export interface UpdateThirdPartySenderDto {
  name?: string;
  description?: string;
  dkimPattern?: string;
  spfPattern?: string;
  enabled?: boolean;
}

/**
 * Service for managing third-party sender configurations.
 * Provides CRUD operations and caching for performance.
 */
@Injectable()
export class ThirdPartySenderService {
  private cache: ThirdPartySender[] | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL = 60000; // 1 minute

  constructor(
    @InjectRepository(ThirdPartySender)
    private readonly thirdPartySenderRepository: Repository<ThirdPartySender>,
  ) {}

  /**
   * Get all third-party senders (with caching)
   */
  async findAll(forceRefresh = false): Promise<ThirdPartySender[]> {
    const now = Date.now();

    // Return cached data if valid
    if (
      !forceRefresh &&
      this.cache !== null &&
      now - this.cacheTimestamp < this.CACHE_TTL
    ) {
      return this.cache;
    }

    // Fetch from database
    const senders = await this.thirdPartySenderRepository.find({
      order: { name: 'ASC' },
    });

    // Update cache
    this.cache = senders;
    this.cacheTimestamp = now;

    return senders;
  }

  /**
   * Get only enabled third-party senders (for detection logic)
   */
  async findEnabled(): Promise<ThirdPartySender[]> {
    const all = await this.findAll();
    return all.filter((sender) => sender.enabled);
  }

  /**
   * Get a single third-party sender by ID
   */
  async findOne(id: string): Promise<ThirdPartySender> {
    const sender = await this.thirdPartySenderRepository.findOne({
      where: { id },
    });

    if (!sender) {
      throw new NotFoundException(`Third-party sender with ID ${id} not found`);
    }

    return sender;
  }

  /**
   * Create a new third-party sender
   */
  async create(dto: CreateThirdPartySenderDto): Promise<ThirdPartySender> {
    // Validate regex patterns
    this.validateRegexPatterns(dto.dkimPattern, dto.spfPattern);

    const sender = this.thirdPartySenderRepository.create({
      name: dto.name,
      description: dto.description,
      dkimPattern: dto.dkimPattern,
      spfPattern: dto.spfPattern,
      enabled: dto.enabled ?? true,
    });

    const saved = await this.thirdPartySenderRepository.save(sender);

    // Invalidate cache
    this.invalidateCache();

    return saved;
  }

  /**
   * Update an existing third-party sender
   */
  async update(
    id: string,
    dto: UpdateThirdPartySenderDto,
  ): Promise<ThirdPartySender> {
    const sender = await this.findOne(id);

    // Validate regex patterns if provided
    this.validateRegexPatterns(dto.dkimPattern, dto.spfPattern);

    // Update fields
    if (dto.name !== undefined) sender.name = dto.name;
    if (dto.description !== undefined) sender.description = dto.description;
    if (dto.dkimPattern !== undefined) sender.dkimPattern = dto.dkimPattern;
    if (dto.spfPattern !== undefined) sender.spfPattern = dto.spfPattern;
    if (dto.enabled !== undefined) sender.enabled = dto.enabled;

    const updated = await this.thirdPartySenderRepository.save(sender);

    // Invalidate cache
    this.invalidateCache();

    return updated;
  }

  /**
   * Delete a third-party sender
   */
  async delete(id: string): Promise<void> {
    const sender = await this.findOne(id);
    await this.thirdPartySenderRepository.remove(sender);

    // Invalidate cache
    this.invalidateCache();
  }

  /**
   * Check if a DKIM domain matches any third-party sender pattern
   */
  async isDkimThirdParty(
    domain: string,
  ): Promise<{ isThirdParty: boolean; sender?: ThirdPartySender }> {
    if (!domain) {
      return { isThirdParty: false };
    }

    const senders = await this.findEnabled();

    for (const sender of senders) {
      if (sender.matchesDkim(domain)) {
        return { isThirdParty: true, sender };
      }
    }

    return { isThirdParty: false };
  }

  /**
   * Check if an SPF domain matches any third-party sender pattern
   */
  async isSpfThirdParty(
    domain: string,
  ): Promise<{ isThirdParty: boolean; sender?: ThirdPartySender }> {
    if (!domain) {
      return { isThirdParty: false };
    }

    const senders = await this.findEnabled();

    for (const sender of senders) {
      if (sender.matchesSpf(domain)) {
        return { isThirdParty: true, sender };
      }
    }

    return { isThirdParty: false };
  }

  /**
   * Validate regex patterns
   */
  private validateRegexPatterns(
    dkimPattern?: string,
    spfPattern?: string,
  ): void {
    if (dkimPattern) {
      try {
        new RegExp(dkimPattern);
      } catch (error) {
        throw new BadRequestException(
          `Invalid DKIM regex pattern: ${error.message}`,
        );
      }
    }

    if (spfPattern) {
      try {
        new RegExp(spfPattern);
      } catch (error) {
        throw new BadRequestException(
          `Invalid SPF regex pattern: ${error.message}`,
        );
      }
    }
  }

  /**
   * Invalidate the cache
   */
  invalidateCache(): void {
    this.cache = null;
    this.cacheTimestamp = 0;
  }
}
