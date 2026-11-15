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

export function presentReportSummary(report: DmarcReport) {
  return {
    id: report.id,
    reportId: report.reportId,
    orgName: report.orgName,
    email: report.email,
    domain: report.domain,
    policy: report.policy,
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
