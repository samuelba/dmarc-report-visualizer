import { ConfigService } from '@nestjs/config';
import { getSenderAuthConfig } from './sender-auth.config';

const configWith = (values: Record<string, string>): ConfigService =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('getSenderAuthConfig', () => {
  it('defaults to flag mode with no trusted sealers or relay domains', () => {
    const config = getSenderAuthConfig(configWith({}));

    expect(config.mode).toBe('flag');
    expect([...config.trustedArcSealers]).toEqual([]);
    expect([...config.relayDomains]).toEqual([]);
  });

  it.each(['off', 'flag', 'enforce'])('accepts mode %s', (mode) => {
    expect(
      getSenderAuthConfig(configWith({ REPORT_SENDER_AUTH: mode })).mode,
    ).toBe(mode);
  });

  it('is case-insensitive and falls back to flag for unknown modes', () => {
    expect(
      getSenderAuthConfig(configWith({ REPORT_SENDER_AUTH: 'ENFORCE' })).mode,
    ).toBe('enforce');
    expect(
      getSenderAuthConfig(configWith({ REPORT_SENDER_AUTH: 'strict' })).mode,
    ).toBe('flag');
  });

  it('parses comma-separated domain lists, normalised to lower case', () => {
    const config = getSenderAuthConfig(
      configWith({
        REPORT_TRUSTED_ARC_SEALERS: ' Google.com, microsoft.com ,,',
        REPORT_RELAY_DOMAINS: 'Relay.Example',
      }),
    );

    expect([...config.trustedArcSealers]).toEqual([
      'google.com',
      'microsoft.com',
    ]);
    expect([...config.relayDomains]).toEqual(['relay.example']);
  });
});
