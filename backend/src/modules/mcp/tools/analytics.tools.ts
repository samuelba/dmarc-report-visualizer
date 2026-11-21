import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  limitSchema,
  MAX_RANGE_DAYS,
  rangeShape,
  resolveRange,
} from '../tool-inputs';
import { READ_ONLY_ANNOTATIONS, ToolDeps, ToolRunner } from '../tool-runner';
import { UNTRUSTED_NOTE } from '../untrusted';

const MAX_OVERVIEW_DOMAINS = 100;
// Anyone can send reports for arbitrary domains, so this list is capped.
const MAX_LISTED_REPORT_DOMAINS = 500;

type RangeArgs = { domain?: string; from?: string; to?: string };

function toFilter(args: RangeArgs) {
  return { domain: args.domain, ...resolveRange(args) };
}

function describeFilter(filter: ReturnType<typeof toFilter>) {
  return {
    domain: filter.domain ?? null,
    from: filter.from,
    to: filter.to,
  };
}

export function registerAnalyticsTools(
  server: McpServer,
  deps: ToolDeps,
  run: ToolRunner,
): void {
  server.registerTool(
    'list_domains',
    {
      title: 'List domains',
      description:
        'Domains managed in the app, and the domains DMARC reports were received for. Start here to learn which domains exist.' +
        UNTRUSTED_NOTE,
      inputSchema: {},
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (args) =>
      run('list_domains', args, async () => {
        const [managed, reported] = await Promise.all([
          deps.domains.findAll(),
          deps.reports.getReportDomains(),
        ]);
        return {
          data: {
            managedDomains: managed.map((d) => ({
              domain: d.domain,
              notes: d.notes,
            })),
            reportDomains: reported.slice(0, MAX_LISTED_REPORT_DOMAINS),
            totalReportDomains: reported.length,
          },
          untrustedFields: ['reportDomains[]'],
        };
      }),
  );

  server.registerTool(
    'get_domain_overview',
    {
      title: 'Domain overview',
      description: `Message volume and DMARC, SPF and DKIM pass rates per domain over the last N days, for managed domains and other domains seen in the From header (top ${MAX_OVERVIEW_DOMAINS} by volume).${UNTRUSTED_NOTE}`,
      inputSchema: {
        days: z
          .number()
          .int()
          .min(1)
          .max(MAX_RANGE_DAYS)
          .default(30)
          .describe('Number of days back from today'),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (args) =>
      run('get_domain_overview', args, async () => {
        const stats = await deps.domains.getDomainStatistics(args.days);
        const top = [...stats]
          .sort((a, b) => b.totalMessages - a.totalMessages)
          .slice(0, MAX_OVERVIEW_DOMAINS);
        return {
          data: {
            days: args.days,
            totalDomains: stats.length,
            domains: top.map((s) => ({
              domain: s.domain,
              isManaged: s.isManaged,
              totalMessages: s.totalMessages,
              passedMessages: s.passedMessages,
              failedMessages: s.failedMessages,
              dmarcPassRate: s.dmarcPassRate,
              spfPassRate: s.spfPassRate,
              dkimPassRate: s.dkimPassRate,
              uniqueSources: s.uniqueSources,
            })),
          },
          untrustedFields: ['domains[].domain'],
        };
      }),
  );

  server.registerTool(
    'get_summary',
    {
      title: 'DMARC summary',
      description:
        'Totals for a period: reports, messages, sources, and DMARC, DKIM and SPF pass and fail counts.',
      inputSchema: rangeShape,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (args) =>
      run('get_summary', args, async () => {
        const filter = toFilter(args);
        const [summary, auth] = await Promise.all([
          deps.reports.summaryStats(filter),
          deps.reports.authSummary(filter),
        ]);
        return { data: { ...describeFilter(filter), summary, auth } };
      }),
  );

  server.registerTool(
    'get_auth_breakdown',
    {
      title: 'Authentication breakdown',
      description:
        'DKIM and SPF results broken down by outcome, plus the DKIM × SPF matrix, for a period.',
      inputSchema: rangeShape,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (args) =>
      run('get_auth_breakdown', args, async () => {
        const filter = toFilter(args);
        const [breakdown, matrix] = await Promise.all([
          deps.reports.authBreakdown(filter),
          deps.reports.authMatrix(filter),
        ]);
        return { data: { ...describeFilter(filter), breakdown, matrix } };
      }),
  );

  server.registerTool(
    'get_timeseries',
    {
      title: 'Time series',
      description:
        'Daily or weekly series of message volume, DKIM/SPF/DMARC pass rates, or dispositions (none, quarantine, reject).',
      inputSchema: {
        ...rangeShape,
        metric: z
          .enum(['volume', 'pass_rate', 'disposition'])
          .default('pass_rate'),
        interval: z.enum(['day', 'week']).default('day'),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (args) =>
      run('get_timeseries', args, async () => {
        const params = { ...toFilter(args), interval: args.interval };
        const series =
          args.metric === 'volume'
            ? await deps.reports.timeSeries(params)
            : args.metric === 'pass_rate'
              ? await deps.reports.authPassRateTimeseries(params)
              : await deps.reports.dispositionTimeseries(params);
        return {
          data: {
            ...describeFilter(params),
            metric: args.metric,
            interval: args.interval,
            series,
          },
        };
      }),
  );

  server.registerTool(
    'get_top_sources',
    {
      title: 'Top sending sources',
      description:
        'Top senders for a period by source IP (with location and ISP), by country, or by From-header domain, with pass counts.' +
        UNTRUSTED_NOTE,
      inputSchema: {
        ...rangeShape,
        by: z.enum(['ip', 'country', 'header_from']).default('ip'),
        limit: limitSchema,
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (args) =>
      run('get_top_sources', args, async () => {
        const filter = toFilter(args);
        const base = { ...describeFilter(filter), by: args.by };
        if (args.by === 'country') {
          const sources = await deps.reports.getTopCountries({
            ...filter,
            limit: args.limit,
          });
          return { data: { ...base, sources } };
        }
        const page = { ...filter, page: 1, pageSize: args.limit };
        if (args.by === 'header_from') {
          const result =
            await deps.reports.getTopHeaderFromDomainsPaginated(page);
          return {
            data: { ...base, sources: result.data },
            untrustedFields: ['sources[].headerFrom'],
          };
        }
        const result = await deps.reports.getTopIpsEnhanced(page);
        return {
          data: { ...base, sources: result.data },
          untrustedFields: ['sources[].city', 'sources[].isp', 'sources[].org'],
        };
      }),
  );

  server.registerTool(
    'get_new_ips',
    {
      title: 'New source IPs',
      description:
        'Source IPs seen for the first time within the period. Useful to spot new senders or spoofing.',
      inputSchema: { ...rangeShape, limit: limitSchema },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    (args) =>
      run('get_new_ips', args, async () => {
        const filter = toFilter(args);
        const ips = await deps.reports.newIps({ ...filter, limit: args.limit });
        return { data: { ...describeFilter(filter), ips } };
      }),
  );
}
