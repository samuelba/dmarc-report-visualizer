import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ApiTokenScope } from '../auth/enums/api-token-scope.enum';
import { DmarcReportService } from '../dmarc/dmarc-report.service';
import { DomainService } from '../dmarc/domain.service';
import { IpLocation } from '../dmarc/entities/ip-location.entity';
import { DmarcReport } from '../dmarc/entities/dmarc-report.entity';
import { DmarcRecord } from '../dmarc/entities/dmarc-record.entity';
import { sanitizeDeep } from './untrusted';
import { ToolInputError } from './tool-inputs';

export const MAX_RESULT_CHARS = 100_000;
const MAX_LOGGED_ARGS_CHARS = 500;

export const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export interface McpRequestContext {
  userId: string;
  tokenId: string;
  scopes: ApiTokenScope[];
  ip: string;
}

export interface ToolDeps {
  reports: DmarcReportService;
  domains: DomainService;
  ipLocations: Repository<IpLocation>;
  reportRepository: Repository<DmarcReport>;
  recordRepository: Repository<DmarcRecord>;
}

export interface ToolPayload {
  data: Record<string, unknown>;
  untrustedFields?: string[];
  /** The handler already cleaned `data` (used for raw XML). */
  preSanitized?: boolean;
}

export type ToolRunner = (
  tool: string,
  args: unknown,
  handler: () => Promise<ToolPayload>,
) => Promise<CallToolResult>;

type Outcome = 'ok' | 'invalid_input' | 'too_large' | 'error';

/**
 * Runs a tool handler: cleans and size-caps its output, turns failures into
 * safe error results, and writes one audit log line per call.
 */
export function createToolRunner(
  ctx: McpRequestContext,
  logger: Logger,
): ToolRunner {
  return async (tool, args, handler) => {
    const startedAt = Date.now();
    const { outcome, result } = await execute(tool, handler, logger);
    logger.log('MCP tool call', {
      event: 'mcp_tool_call',
      tool,
      outcome,
      tokenId: ctx.tokenId,
      userId: ctx.userId,
      ipAddress: ctx.ip,
      args: summarizeArgs(args),
      durationMs: Date.now() - startedAt,
    });
    return result;
  };
}

async function execute(
  tool: string,
  handler: () => Promise<ToolPayload>,
  logger: Logger,
): Promise<{ outcome: Outcome; result: CallToolResult }> {
  try {
    const payload = await handler();
    const data = payload.preSanitized
      ? payload.data
      : (sanitizeDeep(payload.data) as Record<string, unknown>);
    const body = { ...data, untrustedFields: payload.untrustedFields ?? [] };
    const text = JSON.stringify(body);
    if (text.length > MAX_RESULT_CHARS) {
      return {
        outcome: 'too_large',
        result: errorResult(
          'The result is too large. Narrow the filters or lower pageSize or limit.',
        ),
      };
    }
    return {
      outcome: 'ok',
      result: { content: [{ type: 'text', text }], structuredContent: body },
    };
  } catch (error) {
    if (error instanceof ToolInputError) {
      return { outcome: 'invalid_input', result: errorResult(error.message) };
    }
    logger.error(
      `MCP tool ${tool} failed`,
      error instanceof Error ? error.stack : String(error),
    );
    return {
      outcome: 'error',
      result: errorResult('The query failed. Try again or narrow the filters.'),
    };
  }
}

function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

function summarizeArgs(args: unknown): string {
  const text = JSON.stringify(args ?? {});
  return text.length > MAX_LOGGED_ARGS_CHARS
    ? `${text.slice(0, MAX_LOGGED_ARGS_CHARS)}…`
    : text;
}
