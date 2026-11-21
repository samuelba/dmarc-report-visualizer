import { DmarcReport } from '../dmarc/entities/dmarc-report.entity';
import { DmarcRecord } from '../dmarc/entities/dmarc-record.entity';

/**
 * Explicit field lists for MCP output. Entities are never spread, so new
 * columns (and the raw XML) stay out unless they are added here on purpose.
 */
export const REPORT_UNTRUSTED_FIELDS = [
  'reportId',
  'orgName',
  'email',
  'domain',
  'policy',
];

export const RECORD_UNTRUSTED_FIELDS = [
  'envelopeTo',
  'envelopeFrom',
  'headerFrom',
  'reasonType',
  'reasonComment',
  'geo.city',
  'geo.isp',
  'geo.org',
  'dkim[].domain',
  'dkim[].selector',
  'dkim[].humanResult',
  'spf[].domain',
  'overrideReasons[].type',
  'overrideReasons[].comment',
  ...REPORT_UNTRUSTED_FIELDS.map((field) => `report.${field}`),
];

/** Fields of <policy_published> (RFC 7489 and DMARCbis). */
const POLICY_FIELDS = [
  'domain',
  'adkim',
  'aspf',
  'p',
  'sp',
  'np',
  'pct',
  'fo',
  'testing',
  'discovery_method',
] as const;

/**
 * The stored policy is the sender's <policy_published> subtree as parsed, so
 * its keys, nesting and size are sender-controlled. Keep scalar standard
 * fields only.
 */
function presentPolicy(policy: unknown): Record<string, string> {
  if (policy === null || typeof policy !== 'object') {
    return {};
  }
  const source = policy as Record<string, unknown>;
  const picked: Record<string, string> = {};
  for (const field of POLICY_FIELDS) {
    const value = source[field];
    if (typeof value === 'string' || typeof value === 'number') {
      picked[field] = String(value);
    }
  }
  return picked;
}

export function presentReportSummary(report: DmarcReport) {
  return {
    id: report.id,
    reportId: report.reportId,
    orgName: report.orgName,
    email: report.email,
    domain: report.domain,
    policy: presentPolicy(report.policy),
    beginDate: report.beginDate,
    endDate: report.endDate,
    authStatus: report.authStatus,
  };
}

export function presentRecord(record: DmarcRecord) {
  return {
    id: record.id,
    reportId: record.reportId,
    sourceIp: record.sourceIp,
    count: record.count,
    disposition: record.disposition,
    dmarcDkim: record.dmarcDkim,
    dmarcSpf: record.dmarcSpf,
    dkimMissing: record.dkimMissing,
    isForwarded: record.isForwarded,
    forwardReason: record.forwardReason,
    envelopeTo: record.envelopeTo,
    envelopeFrom: record.envelopeFrom,
    headerFrom: record.headerFrom,
    reasonType: record.reasonType,
    reasonComment: record.reasonComment,
    geo: {
      country: record.geoCountry,
      countryName: record.geoCountryName,
      city: record.geoCity,
      isp: record.geoIsp,
      org: record.geoOrg,
    },
    dkim: (record.dkimResults ?? []).map((dkim) => ({
      domain: dkim.domain,
      selector: dkim.selector,
      result: dkim.result,
      humanResult: dkim.humanResult,
    })),
    spf: (record.spfResults ?? []).map((spf) => ({
      domain: spf.domain,
      result: spf.result,
    })),
    overrideReasons: (record.policyOverrideReasons ?? []).map((reason) => ({
      type: reason.type,
      comment: reason.comment,
    })),
    report: record.report ? presentReportSummary(record.report) : undefined,
  };
}
