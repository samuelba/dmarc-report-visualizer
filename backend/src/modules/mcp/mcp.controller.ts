import {
  Controller,
  Delete,
  Get,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ApiTokenAuth } from '../auth/decorators/api-token-auth.decorator';
import { ApiTokenRequest } from '../auth/guards/api-token.guard';
import { McpServerFactory } from './mcp-server.factory';
import { isOriginAllowed, parseAllowedOrigins } from './origin';

/**
 * Streamable HTTP MCP endpoint in stateless mode: every POST carries a
 * Bearer API token and is answered with JSON, no session is kept.
 */
@Controller('mcp')
@ApiTokenAuth()
export class McpController {
  private readonly logger = new Logger(McpController.name);
  private readonly allowedOrigins = parseAllowedOrigins();

  constructor(private readonly serverFactory: McpServerFactory) {}

  @Post()
  async handle(
    @Req() request: ApiTokenRequest,
    @Res() response: Response,
  ): Promise<void> {
    if (!isOriginAllowed(request.headers.origin, this.allowedOrigins)) {
      response.status(HttpStatus.FORBIDDEN).json({
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Origin not allowed',
      });
      return;
    }

    if (Array.isArray(request.body)) {
      response.status(HttpStatus.BAD_REQUEST).json({
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Batch requests are not supported' },
        id: null,
      });
      return;
    }

    const { user, apiToken } = request;
    if (!user || !apiToken) {
      throw new UnauthorizedException('API token required');
    }

    const server = this.serverFactory.create({
      userId: user.id,
      tokenId: apiToken.id,
      scopes: apiToken.scopes,
      ip: request.ip || request.socket?.remoteAddress || 'unknown',
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    response.on('close', () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      this.logger.error(
        'MCP request failed',
        error instanceof Error ? error.stack : String(error),
      );
      if (!response.headersSent) {
        response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal error' },
          id: null,
        });
      }
    }
  }

  @Get()
  rejectGet(@Res() response: Response): void {
    methodNotAllowed(response);
  }

  @Delete()
  rejectDelete(@Res() response: Response): void {
    methodNotAllowed(response);
  }
}

function methodNotAllowed(response: Response): void {
  response.setHeader('Allow', 'POST');
  response.status(HttpStatus.METHOD_NOT_ALLOWED).json({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Method not allowed. This server is stateless: use POST.',
    },
    id: null,
  });
}
