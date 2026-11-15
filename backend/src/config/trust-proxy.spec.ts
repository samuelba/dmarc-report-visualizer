import { Controller, Get, Req } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Request } from 'express';
import * as request from 'supertest';
import { applyTrustProxy, parseTrustProxy } from './trust-proxy';

describe('parseTrustProxy', () => {
  it.each([undefined, '', '  '])('defaults to one hop for %p', (raw) => {
    expect(parseTrustProxy(raw)).toBe(1);
  });

  it('parses a hop count', () => {
    expect(parseTrustProxy('2')).toBe(2);
  });

  it.each(['0', 'false', 'FALSE'])('disables trust for %p', (raw) => {
    expect(parseTrustProxy(raw)).toBe(false);
  });

  it.each(['true', 'TRUE', ' true '])('rejects %p', (raw) => {
    expect(() => parseTrustProxy(raw)).toThrow(/TRUST_PROXY=true/);
  });

  it('passes an address list through', () => {
    expect(parseTrustProxy('loopback, 10.0.0.0/8')).toBe(
      'loopback, 10.0.0.0/8',
    );
  });
});

@Controller()
class IpController {
  @Get('ip')
  ip(@Req() req: Request): { ip: string | undefined } {
    return { ip: req.ip };
  }
}

describe('applyTrustProxy (HTTP)', () => {
  async function createApp(raw: string): Promise<NestExpressApplication> {
    const module = await Test.createTestingModule({
      controllers: [IpController],
    }).compile();
    const app = module.createNestApplication<NestExpressApplication>();
    applyTrustProxy(app, raw);
    await app.init();
    return app;
  }

  it('uses the address appended by the one trusted proxy', async () => {
    const app = await createApp('1');
    const res = await request(app.getHttpServer())
      .get('/ip')
      .set('X-Forwarded-For', '1.1.1.1, 203.0.113.7');
    expect(res.body).toEqual({ ip: '203.0.113.7' });
    await app.close();
  });

  it('ignores X-Forwarded-For when trust is disabled', async () => {
    const app = await createApp('false');
    const res = await request(app.getHttpServer())
      .get('/ip')
      .set('X-Forwarded-For', '203.0.113.7');
    expect(res.body.ip).not.toBe('203.0.113.7');
    expect(res.body.ip).toMatch(/127\.0\.0\.1|::1/);
    await app.close();
  });
});
