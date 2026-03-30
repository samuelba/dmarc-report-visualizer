import { getCountryName } from './country.utils';

describe('Country Utils', () => {
  describe('getCountryName', () => {
    it('should return full country name for valid codes', () => {
      expect(getCountryName('US')).toBe('United States');
      expect(getCountryName('GB')).toBe('United Kingdom');
      expect(getCountryName('NL')).toBe('Netherlands');
      expect(getCountryName('DE')).toBe('Germany');
    });

    it('should handle lowercase codes', () => {
      expect(getCountryName('us')).toBe('United States');
      expect(getCountryName('gb')).toBe('United Kingdom');
    });

    it('should return input for empty string', () => {
      expect(getCountryName('')).toBe('');
    });

    it('should return input for null/undefined', () => {
      expect(getCountryName(null as any)).toBe(null);
      expect(getCountryName(undefined as any)).toBe(undefined);
    });

    it('should return input for codes that are not 2 characters', () => {
      expect(getCountryName('A')).toBe('A');
      expect(getCountryName('USA')).toBe('USA');
      expect(getCountryName('ABCD')).toBe('ABCD');
    });

    it('should handle invalid 2-char codes', () => {
      // Intl.DisplayNames may return descriptive names like 'Unknown Region' for unassigned codes
      const xxResult = getCountryName('XX');
      expect(typeof xxResult).toBe('string');
      expect(xxResult.length).toBeGreaterThan(0);
      const zzResult = getCountryName('ZZ');
      expect(typeof zzResult).toBe('string');
      expect(zzResult.length).toBeGreaterThan(0);
    });
  });
});
