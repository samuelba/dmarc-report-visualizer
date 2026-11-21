import { getOptionalMcpModules } from './app.module';
import { ApiTokenModule } from './modules/auth/api-token.module';
import { McpModule } from './modules/mcp/mcp.module';

describe('getOptionalMcpModules', () => {
  it('leaves API tokens and the MCP server out when MCP is disabled', () => {
    expect(getOptionalMcpModules(false)).toEqual([]);
  });

  it('adds API tokens and the MCP server when MCP is enabled', () => {
    expect(getOptionalMcpModules(true)).toEqual([ApiTokenModule, McpModule]);
  });
});
