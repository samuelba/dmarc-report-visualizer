import {
  MAX_UNTRUSTED_TEXT,
  MAX_XML_CHARS,
  sanitizeDeep,
  sanitizeText,
  sanitizeXml,
} from './untrusted';

describe('sanitizeText', () => {
  it('replaces control characters and drops invisible formatting characters', () => {
    expect(sanitizeText('a\nb\u0000c​d‮e')).toBe('a b cde');
  });

  it('truncates long values and says so', () => {
    const out = sanitizeText('x'.repeat(1000));

    expect(out).toBe(`${'x'.repeat(MAX_UNTRUSTED_TEXT)}…[truncated]`);
  });

  it('keeps short values unchanged', () => {
    expect(sanitizeText('google.com')).toBe('google.com');
  });
});

describe('sanitizeDeep', () => {
  it('cleans nested strings and converts dates and non-finite numbers', () => {
    expect(
      sanitizeDeep({
        a: ['x\ny'],
        b: { c: new Date('2026-01-01T00:00:00Z') },
        n: 3,
        f: null,
        nan: NaN,
        ok: true,
      }),
    ).toEqual({
      a: ['x y'],
      b: { c: '2026-01-01T00:00:00.000Z' },
      n: 3,
      f: null,
      nan: null,
      ok: true,
    });
  });
});

describe('sanitizeXml', () => {
  it('keeps the XML layout but strips invisible characters', () => {
    expect(sanitizeXml('<a>‮b\u0000</a>\n')).toEqual({
      xml: '<a>b</a>\n',
      truncated: false,
    });
  });

  it('caps the size', () => {
    const result = sanitizeXml('<'.repeat(MAX_XML_CHARS + 10));

    expect(result.truncated).toBe(true);
    expect(result.xml).toHaveLength(MAX_XML_CHARS);
  });
});
