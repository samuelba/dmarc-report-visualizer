import { isOriginAllowed, parseAllowedOrigins } from './origin';

describe('parseAllowedOrigins', () => {
  it('combines CORS_ORIGINS and MCP_ALLOWED_ORIGINS and ignores *', () => {
    expect(
      parseAllowedOrigins({
        CORS_ORIGINS: '*, https://dmarc.example.com',
        MCP_ALLOWED_ORIGINS: 'http://localhost:6274/',
      }),
    ).toEqual(['https://dmarc.example.com', 'http://localhost:6274']);
  });

  it('is empty when nothing is configured', () => {
    expect(parseAllowedOrigins({})).toEqual([]);
  });
});

describe('isOriginAllowed', () => {
  const allowed = ['https://dmarc.example.com'];

  it('allows requests without an Origin header (non-browser clients)', () => {
    expect(isOriginAllowed(undefined, allowed)).toBe(true);
  });

  it('allows configured origins', () => {
    expect(isOriginAllowed('https://dmarc.example.com', allowed)).toBe(true);
    expect(isOriginAllowed('https://dmarc.example.com/', allowed)).toBe(true);
  });

  it('rejects other browser origins', () => {
    expect(isOriginAllowed('https://evil.example', allowed)).toBe(false);
    expect(isOriginAllowed('null', allowed)).toBe(false);
    expect(isOriginAllowed('', allowed)).toBe(false);
  });
});
