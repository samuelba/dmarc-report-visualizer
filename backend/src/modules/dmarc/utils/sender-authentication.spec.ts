import { generateKeyPairSync } from 'crypto';
import { authenticate, dkimSign, sealMessage } from 'mailauth';
import {
  authenticateMessage,
  evaluateSender,
  MessageAuth,
  summarizeAuthentication,
} from './sender-authentication';

interface TestKey {
  privateKey: string;
  txt: string;
}

const makeKey = (): TestKey => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const der = publicKey.export({ type: 'spki', format: 'der' });
  return {
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    txt: `v=DKIM1; k=rsa; p=${der.toString('base64')}`,
  };
};

const keys = {
  reporter: makeKey(),
  relay: makeKey(),
  sealer: makeKey(),
  other: makeKey(),
};

const dnsRecords: Record<string, string> = {
  's1._domainkey.reporter.example': keys.reporter.txt,
  's1._domainkey.mail.reporter.example': keys.reporter.txt,
  'g._domainkey.relay.example': keys.relay.txt,
  'arc._domainkey.sealer.example': keys.sealer.txt,
  'arc._domainkey.untrusted.example': keys.other.txt,
};

const dnsError = (code: string) => Object.assign(new Error(code), { code });

const resolver = (name: string, rr: string) => {
  const record = dnsRecords[name.toLowerCase()];
  if (rr === 'TXT' && record) {
    return Promise.resolve([[record]]);
  }
  return Promise.reject(dnsError('ENOTFOUND'));
};

const message = (from: string): string =>
  [
    `From: ${from}`,
    'To: dmarc-reports@relay.example',
    'Subject: Report Domain: example.com Report-ID: r1',
    'Message-ID: <r1@reporter.example>',
    'Date: Sat, 15 Nov 2026 10:00:00 +0000',
    'MIME-Version: 1.0',
    'Content-Type: text/plain',
    '',
    'report attached',
    '',
  ].join('\r\n');

const sign = async (
  msg: string,
  signingDomain: string,
  selector: string,
  key: TestKey,
): Promise<string> => {
  const { signatures } = await dkimSign(msg, {
    signatureData: [{ signingDomain, selector, privateKey: key.privateKey }],
  });
  return signatures + msg;
};

const seal = async (
  msg: string,
  sealer: string,
  key: TestKey,
  authResults: string,
): Promise<string> => {
  const cv = /^ARC-Seal:/im.test(msg) ? 'pass' : 'none';
  const headers = await sealMessage(msg, {
    signingDomain: sealer,
    selector: 'arc',
    privateKey: key.privateKey,
    authResults,
    cv,
  });
  return headers.toString() + msg;
};

const rewriteFrom = (msg: string, from: string): string =>
  msg.replace(/^From: .*$/m, `From: ${from}`);

/** Reporter → Google-Groups-like relay that rewrites From and ARC-seals. */
const relayed = async (
  reporterFrom: string,
  arrivalResults: string,
  sealers: { first: string; later: string } = {
    first: 'sealer.example',
    later: 'sealer.example',
  },
  laterResults?: string,
): Promise<string> => {
  const keyFor = (d: string) =>
    d === 'sealer.example' ? keys.sealer : keys.other;
  let msg = await sign(
    message(reporterFrom),
    'reporter.example',
    's1',
    keys.reporter,
  );
  msg = await seal(msg, sealers.first, keyFor(sealers.first), arrivalResults);
  msg = rewriteFrom(
    msg,
    '"Reporter via Reports" <dmarc-reports@relay.example>',
  );
  msg = await sign(msg, 'relay.example', 'g', keys.relay);
  msg = await seal(
    msg,
    sealers.later,
    keyFor(sealers.later),
    laterResults ??
      `mx.sealer.example; ${arrivalResults.split(';').slice(1).join(';')}; arc=pass (i=1)`,
  );
  return msg;
};

const authOf = async (
  raw: string,
  trusted = ['sealer.example'],
): Promise<Omit<MessageAuth, 'tempError'>> =>
  summarizeAuthentication(
    await authenticate(Buffer.from(raw), { resolver, disableBimi: true }),
    new Set(trusted),
  );

const verdictFor = (
  auth: Omit<MessageAuth, 'tempError'>,
  reportEmail: string,
  options: Partial<Parameters<typeof evaluateSender>[2]> = {},
) =>
  evaluateSender({ ...auth, tempError: false }, reportEmail, {
    excludedOrgDomains: new Set(['relay.example']),
    ...options,
  });

describe('sender authentication', () => {
  it('aligns a directly DKIM-signed report', async () => {
    const raw = await sign(
      message('noreply@reporter.example'),
      'reporter.example',
      's1',
      keys.reporter,
    );

    const verdict = verdictFor(await authOf(raw), 'noreply@reporter.example');

    expect(verdict).toMatchObject({
      authStatus: 'aligned',
      authMethod: 'dkim',
      authDomain: 'reporter.example',
      claimedDomain: 'reporter.example',
    });
  });

  it('treats a subdomain signer as aligned with its organizational domain', async () => {
    const raw = await sign(
      message('noreply@mail.reporter.example'),
      'mail.reporter.example',
      's1',
      keys.reporter,
    );

    expect(
      verdictFor(await authOf(raw), 'dmarc@reporter.example'),
    ).toMatchObject({
      authStatus: 'aligned',
      authDomain: 'mail.reporter.example',
    });
  });

  it('aligns a relayed report through the trusted ARC record when From was rewritten', async () => {
    const raw = await relayed(
      'noreply@reporter.example',
      'mx.sealer.example; dkim=pass header.i=@reporter.example; dmarc=pass header.from=reporter.example',
    );

    const auth = await authOf(raw);
    const verdict = verdictFor(auth, 'noreply@reporter.example');

    expect(auth.arc.result).toBe('pass');
    expect(verdict).toMatchObject({
      authStatus: 'aligned',
      authMethod: 'arc',
      authDomain: 'reporter.example',
    });
    expect(verdict.authDetails.excludedRelayIdentities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ domain: 'relay.example' }),
      ]),
    );
  });

  it('stops the ARC walk at an untrusted sealer but keeps newer trusted records', async () => {
    const raw = await relayed(
      'noreply@reporter.example',
      'mx.untrusted.example; dkim=pass header.i=@reporter.example',
      { first: 'untrusted.example', later: 'sealer.example' },
    );

    const auth = await authOf(raw);

    expect(auth.arc.instances.map((i) => [i.i, i.trusted])).toEqual([
      [2, true],
      [1, false],
    ]);
    expect(verdictFor(auth, 'noreply@reporter.example').authStatus).toBe(
      'aligned',
    );
  });

  it('accepts an SPF-only reporter through a recorded dmarc=pass', async () => {
    const raw = await relayed(
      'no-reply@uk-1.reporter.example',
      'mx.sealer.example; dkim=permerror (no key) header.i=@uk-1.reporter.example; spf=pass smtp.mailfrom=no-reply@uk-1.reporter.example; dmarc=pass header.from=uk-1.reporter.example',
    );

    expect(
      verdictFor(await authOf(raw), 'no-reply@uk-1.reporter.example'),
    ).toMatchObject({
      authStatus: 'aligned',
      authMethod: 'arc',
      authDomain: 'uk-1.reporter.example',
    });
  });

  describe('a reporter whose <email> is on another domain (Yahoo shape)', () => {
    const arrival =
      'mx.sealer.example; dkim=pass header.i=@reporter.example; dmarc=pass header.from=dmarc.reporter.example';

    it('is authenticated but unaligned, naming the exact From domain', async () => {
      const raw = await relayed('noreply@dmarc.reporter.example', arrival);

      expect(
        verdictFor(await authOf(raw), 'dmarchelp@reporterinc.example'),
      ).toMatchObject({
        authStatus: 'unaligned',
        authMethod: 'arc',
        authDomain: 'dmarc.reporter.example',
        claimedDomain: 'reporterinc.example',
      });
    });

    it('becomes aligned once the exact pair is trusted', async () => {
      const raw = await relayed('noreply@dmarc.reporter.example', arrival);

      expect(
        verdictFor(await authOf(raw), 'dmarchelp@reporterinc.example', {
          isTrustedPair: (claimed, authDomain) =>
            claimed === 'reporterinc.example' &&
            authDomain === 'dmarc.reporter.example',
        }),
      ).toMatchObject({
        authStatus: 'aligned',
        authDomain: 'dmarc.reporter.example',
      });
    });

    it('does not let ordinary mailboxes of the signing domain use that trust', async () => {
      const raw = await relayed(
        'someone@reporter.example',
        'mx.sealer.example; dkim=pass header.i=@reporter.example; dmarc=pass header.from=reporter.example',
      );

      expect(
        verdictFor(await authOf(raw), 'dmarchelp@reporterinc.example', {
          isTrustedPair: (claimed, authDomain) =>
            claimed === 'reporterinc.example' &&
            authDomain === 'dmarc.reporter.example',
        }).authStatus,
      ).toBe('unaligned');
    });
  });

  it('names the identity recorded closest to the reporter when the relay is not excluded', async () => {
    // The newest hop records the relay itself, as Google does on final delivery.
    const raw = await relayed(
      'noreply@dmarc.reporter.example',
      'mx.sealer.example; dkim=pass header.i=@reporter.example; dmarc=pass header.from=dmarc.reporter.example',
      { first: 'sealer.example', later: 'sealer.example' },
      'mx.sealer.example; dkim=pass header.i=@relay.example; dmarc=pass header.from=relay.example; arc=pass (i=1)',
    );

    const verdict = verdictFor(
      await authOf(raw),
      'dmarchelp@reporterinc.example',
      { excludedOrgDomains: new Set() },
    );

    expect(verdict).toMatchObject({
      authStatus: 'unaligned',
      authDomain: 'dmarc.reporter.example',
    });
  });

  it('never lets the relay signature vouch for a report claiming the relay domain', async () => {
    const raw = await sign(
      message('"Attacker via Reports" <dmarc-reports@relay.example>'),
      'relay.example',
      'g',
      keys.relay,
    );

    expect(
      verdictFor(await authOf(raw), 'dmarc@relay.example').authStatus,
    ).toBe('unverified');
  });

  it('ignores ARC records sealed only by untrusted sealers', async () => {
    const raw = await relayed(
      'noreply@reporter.example',
      'mx.untrusted.example; dkim=pass header.i=@reporter.example',
      { first: 'untrusted.example', later: 'untrusted.example' },
    );

    expect(
      verdictFor(await authOf(raw), 'noreply@reporter.example').authStatus,
    ).toBe('unverified');
  });

  it('ignores a chain whose seal was tampered with', async () => {
    const raw = (
      await relayed(
        'noreply@reporter.example',
        'mx.sealer.example; dkim=pass header.i=@other.example',
      )
    ).replace('header.i=@other.example', 'header.i=@reporter.example');

    const auth = await authOf(raw);

    expect(auth.arc.result).toBe('fail');
    expect(verdictFor(auth, 'noreply@reporter.example').authStatus).toBe(
      'unverified',
    );
  });

  describe('authenticateMessage', () => {
    it('verifies with the given resolver and reports no temporary error', async () => {
      const raw = await relayed(
        'noreply@reporter.example',
        'mx.sealer.example; dkim=pass header.i=@reporter.example',
      );

      const auth = await authenticateMessage(
        Buffer.from(raw),
        new Set(['sealer.example']),
        resolver,
      );

      expect(auth.tempError).toBe(false);
      expect(auth.arc.result).toBe('pass');
    });

    it('flags a transient DNS failure as a temporary error', async () => {
      const raw = await relayed(
        'noreply@reporter.example',
        'mx.sealer.example; dkim=pass header.i=@reporter.example',
      );

      const auth = await authenticateMessage(
        Buffer.from(raw),
        new Set(['sealer.example']),
        () => Promise.reject(dnsError('ETIMEOUT')),
      );

      expect(auth.tempError).toBe(true);
      expect(auth.identities).toEqual([]);
    });
  });

  it('reports a temporary error separately so the caller can retry', () => {
    const verdict = evaluateSender(
      {
        identities: [],
        dkim: [],
        arc: { result: 'fail', instances: [] },
        tempError: true,
      },
      'noreply@reporter.example',
      { excludedOrgDomains: new Set() },
    );

    expect(verdict.authStatus).toBe('unverified');
    expect(verdict.tempError).toBe(true);
  });
});
