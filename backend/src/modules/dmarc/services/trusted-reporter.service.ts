import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DmarcReport } from '../entities/dmarc-report.entity';
import { TrustedReporterDomain } from '../entities/trusted-reporter-domain.entity';
import { orgDomain } from '../utils/sender-authentication';

export interface TrustReporterInput {
  claimedDomain: string;
  authDomain: string;
  note?: string;
}

export interface UnalignedSender {
  claimedDomain: string;
  authDomain: string;
  orgNames: string[];
  reportCount: number;
  firstSeen: Date;
  lastSeen: Date;
}

const MAX_UNALIGNED_GROUPS = 200;

const pairKey = (claimed: string, auth: string): string =>
  `${claimed}\n${auth}`;

const normalize = (domain: string): string =>
  domain.trim().toLowerCase().replace(/\.$/, '');

/**
 * Admin-approved reporter aliases. Trust is per exact authenticated domain,
 * so trusting dmarc.yahoo.com does not let every yahoo.com mailbox speak
 * for yahooinc.com.
 */
@Injectable()
export class TrustedReporterService {
  private readonly logger = new Logger(TrustedReporterService.name);

  constructor(
    @InjectRepository(TrustedReporterDomain)
    private readonly pairRepository: Repository<TrustedReporterDomain>,
    @InjectRepository(DmarcReport)
    private readonly reportRepository: Repository<DmarcReport>,
  ) {}

  /** Loaded per use: the table is tiny and stays consistent across instances. */
  async trustedPairs(): Promise<(claimed: string, auth: string) => boolean> {
    const rows = await this.pairRepository.find({
      select: { claimedDomain: true, authDomain: true },
    });
    const keys = new Set(
      rows.map((r) => pairKey(r.claimedDomain, r.authDomain)),
    );
    return (claimed, auth) => keys.has(pairKey(claimed, normalize(auth)));
  }

  listTrusted(): Promise<TrustedReporterDomain[]> {
    return this.pairRepository.find({ order: { createdAt: 'DESC' } });
  }

  listUnaligned(): Promise<UnalignedSender[]> {
    return this.reportRepository.query(
      `
      SELECT "claimedDomain", "authDomain",
        COUNT(*)::int AS "reportCount",
        MIN("createdAt") AS "firstSeen",
        MAX("createdAt") AS "lastSeen",
        COALESCE((ARRAY_AGG(DISTINCT "orgName") FILTER (WHERE "orgName" IS NOT NULL))[1:3], '{}') AS "orgNames"
      FROM dmarc_reports
      WHERE "authStatus" = 'unaligned'
        AND "claimedDomain" IS NOT NULL
        AND "authDomain" IS NOT NULL
      GROUP BY "claimedDomain", "authDomain"
      ORDER BY MAX("createdAt") DESC
      LIMIT $1
      `,
      [MAX_UNALIGNED_GROUPS],
    );
  }

  async trust(
    input: TrustReporterInput,
    user: { id: string; email: string },
  ): Promise<{ trusted: TrustedReporterDomain; upgradedReports: number }> {
    const { claimedDomain, authDomain } = this.validatePair(input);

    if (
      await this.pairRepository.findOne({
        where: { claimedDomain, authDomain },
      })
    ) {
      throw new ConflictException(
        `${authDomain} is already trusted for ${claimedDomain}`,
      );
    }

    const result = await this.pairRepository.manager.transaction(
      async (manager) => {
        const pairs = manager.getRepository(TrustedReporterDomain);
        const trusted = await pairs.save(
          pairs.create({
            claimedDomain,
            authDomain,
            note: input.note?.trim() || null,
            createdBy: user.id,
            createdByEmail: user.email,
          }),
        );
        const upgraded = await manager
          .getRepository(DmarcReport)
          .update(
            { authStatus: 'unaligned', claimedDomain, authDomain },
            { authStatus: 'aligned' },
          );
        return { trusted, upgradedReports: upgraded.affected ?? 0 };
      },
    );

    this.logger.log(
      `${user.email} trusted ${authDomain} for ${claimedDomain}; aligned ${result.upgradedReports} reports`,
    );
    return result;
  }

  async revoke(id: string): Promise<{ downgradedReports: number }> {
    const pair = await this.pairRepository.findOne({ where: { id } });
    if (!pair) {
      throw new NotFoundException('Trusted reporter not found');
    }
    const downgradedReports = await this.pairRepository.manager.transaction(
      async (manager) => {
        await manager.getRepository(TrustedReporterDomain).delete(id);
        // Naturally aligned reports never have this pair: for them the
        // authenticated domain belongs to the claimed organization.
        const downgraded = await manager.getRepository(DmarcReport).update(
          {
            authStatus: 'aligned',
            claimedDomain: pair.claimedDomain,
            authDomain: pair.authDomain,
          },
          { authStatus: 'unaligned' },
        );
        return downgraded.affected ?? 0;
      },
    );

    this.logger.log(
      `Revoked trust in ${pair.authDomain} for ${pair.claimedDomain}; ${downgradedReports} reports are unaligned again`,
    );
    return { downgradedReports };
  }

  private validatePair(input: TrustReporterInput): {
    claimedDomain: string;
    authDomain: string;
  } {
    const claimedDomain = normalize(input.claimedDomain);
    const authDomain = normalize(input.authDomain);

    if (orgDomain(claimedDomain) !== claimedDomain) {
      throw new BadRequestException(
        'claimedDomain must be an organizational domain, e.g. yahooinc.com',
      );
    }
    const authOrg = /^[a-z0-9.-]+$/.test(authDomain)
      ? orgDomain(authDomain)
      : null;
    if (!authOrg) {
      throw new BadRequestException('authDomain must be a domain name');
    }
    if (authOrg === claimedDomain) {
      throw new BadRequestException(
        `${authDomain} already aligns with ${claimedDomain}`,
      );
    }
    return { claimedDomain, authDomain };
  }
}
