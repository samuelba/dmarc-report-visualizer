import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Response } from 'express';
import { McpController } from './mcp.controller';
import { McpServerFactory } from './mcp-server.factory';
import { API_TOKEN_AUTH_KEY } from '../auth/decorators/api-token-auth.decorator';
import { ApiTokenGuard, ApiTokenRequest } from '../auth/guards/api-token.guard';

function makeResponse() {
  const response = {
    setHeader: jest.fn(),
    status: jest.fn(),
    json: jest.fn(),
    on: jest.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
}

describe('McpController', () => {
  const factory = { create: jest.fn() };

  beforeEach(() => {
    factory.create.mockReset();
    process.env.CORS_ORIGINS = 'https://dmarc.example.com';
  });

  afterEach(() => {
    delete process.env.CORS_ORIGINS;
  });

  it('is authenticated by API token only', () => {
    expect(Reflect.getMetadata(API_TOKEN_AUTH_KEY, McpController)).toBe(true);
    expect(Reflect.getMetadata(GUARDS_METADATA, McpController)).toEqual([
      ApiTokenGuard,
    ]);
  });

  it('rejects browser requests from other origins', async () => {
    const controller = new McpController(
      factory as unknown as McpServerFactory,
    );
    const response = makeResponse();
    const request = {
      headers: { origin: 'https://evil.example' },
      user: { id: 'user-1' },
      apiToken: { id: 'token-1', scopes: [] },
    } as unknown as ApiTokenRequest;

    await controller.handle(request, response as unknown as Response);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(factory.create).not.toHaveBeenCalled();
  });

  it('rejects JSON-RPC batches so one request cannot bypass the rate limit', async () => {
    const controller = new McpController(
      factory as unknown as McpServerFactory,
    );
    const response = makeResponse();
    const request = {
      headers: {},
      body: [{ jsonrpc: '2.0', id: 1, method: 'tools/list' }],
      user: { id: 'user-1' },
      apiToken: { id: 'token-1', scopes: [] },
    } as unknown as ApiTokenRequest;

    await controller.handle(request, response as unknown as Response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(factory.create).not.toHaveBeenCalled();
  });

  it.each(['rejectGet', 'rejectDelete'] as const)(
    '%s answers 405 because the server is stateless',
    (method) => {
      const controller = new McpController(
        factory as unknown as McpServerFactory,
      );
      const response = makeResponse();

      controller[method](response as unknown as Response);

      expect(response.setHeader).toHaveBeenCalledWith('Allow', 'POST');
      expect(response.status).toHaveBeenCalledWith(405);
    },
  );
});
