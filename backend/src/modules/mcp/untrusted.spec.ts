import {
  MAX_ITEMS,
  MAX_KEY_LENGTH,
  MAX_UNTRUSTED_TEXT,
  MAX_XML_CHARS,
  sanitizeDeep,
  sanitizeText,
  sanitizeXml,
} from './untrusted';

const TRUNCATED = '\u{2026}[truncated]';
const ZERO_WIDTH_SPACE = '\u{200B}';
const RIGHT_TO_LEFT_OVERRIDE = '\u{202E}';

describe('sanitizeText', () => {
  it('replaces control characters and drops invisible formatting characters', () => {
    expect(
      sanitizeText(`a\nb\u{0}c${ZERO_WIDTH_SPACE}d${RIGHT_TO_LEFT_OVERRIDE}e`),
    ).toBe('a b cde');
  });

  it('truncates long values and says so', () => {
    expect(sanitizeText('x'.repeat(1000))).toBe(
      `${'x'.repeat(MAX_UNTRUSTED_TEXT)}${TRUNCATED}`,
    );
  });

  it('keeps short values unchanged', () => {
    expect(sanitizeText('google.com')).toBe('google.com');
  });

  it('drops Unicode tag characters used to hide instructions', () => {
    const hidden = Array.from('IGNORE', (c) =>
      String.fromCodePoint(0xe0000 + c.charCodeAt(0)),
    ).join('');

    expect(sanitizeText(`google${hidden}.com`)).toBe('google.com');
  });

  it('drops variation selectors, soft hyphens, fillers and private use, and breaks on line separators', () => {
    const input = [
      'a',
      '\u{FE0F}',
      'b',
      '\u{AD}',
      'c',
      '\u{E0100}',
      'd',
      '\u{3164}',
      'e',
      '\u{2028}',
      'f',
      '\u{2029}',
      'g',
      '\u{E000}',
      'h',
    ].join('');

    expect(sanitizeText(input)).toBe('abcde f gh');
  });

  it('does not split a surrogate pair when truncating', () => {
    const out = sanitizeText('\u{1F600}'.repeat(300));

    expect(Array.from(out.replace(TRUNCATED, ''))).toHaveLength(
      MAX_UNTRUSTED_TEXT,
    );
    const isLoneSurrogate = (c: string) =>
      c.length === 1 && c.charCodeAt(0) >= 0xd800 && c.charCodeAt(0) <= 0xdfff;
    expect(Array.from(out).some(isLoneSurrogate)).toBe(false);
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

  it('cleans and shortens object keys, which senders can also control', () => {
    const out = sanitizeDeep({
      [`k${RIGHT_TO_LEFT_OVERRIDE}ey${String.fromCodePoint(0xe0041)}`]: 1,
      ['x'.repeat(300)]: 2,
    }) as Record<string, number>;

    expect(Object.keys(out)).toEqual(['key', 'x'.repeat(MAX_KEY_LENGTH)]);
  });

  it('caps the number of array items and object keys', () => {
    const many = Array.from({ length: MAX_ITEMS + 10 }, (_, i) => i);
    const wide = Object.fromEntries(many.map((i) => [`k${i}`, i]));

    const array = sanitizeDeep(many) as unknown[];
    const object = sanitizeDeep(wide) as Record<string, unknown>;

    expect(array).toHaveLength(MAX_ITEMS + 1);
    expect(array.at(-1)).toBe('\u{2026}[10 more omitted]');
    expect(Object.keys(object)).toHaveLength(MAX_ITEMS);
  });
});

describe('sanitizeXml', () => {
  it('keeps the XML layout but strips invisible and control characters', () => {
    expect(sanitizeXml(`<a>${RIGHT_TO_LEFT_OVERRIDE}b\u{0}</a>\n`)).toEqual({
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
