import { getOptionalMcpModules } from './app.module';
import { ApiTokenModule } from './modules/auth/api-token.module';

describe('getOptionalMcpModules', () => {
  it('leaves API tokens out of the app when MCP is disabled', () => {
    expect(getOptionalMcpModules(false)).toEqual([]);
  });

  it('adds API tokens when MCP is enabled', () => {
    expect(getOptionalMcpModules(true)).toEqual([ApiTokenModule]);
  });
});
