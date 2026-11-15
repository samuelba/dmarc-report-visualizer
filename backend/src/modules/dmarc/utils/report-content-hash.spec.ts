import { hashReportXml } from './report-content-hash';

describe('hashReportXml', () => {
  it('returns the hex sha256 of the XML', () => {
    expect(hashReportXml('<feedback/>')).toBe(
      '1014da24c7865fb0a5d6eebf214805ccff852cab7f2bbf89b3beb4d7deb27140',
    );
  });

  it('hashes UTF-8 bytes, matching sha256(convert_to(xml, UTF8)) in Postgres', () => {
    expect(hashReportXml('ä')).toBe(
      '33e6d73fee82904c8d7afb78de1154d1e8dc2a0edb08120e63df5b9385c2d9cc',
    );
  });

  it('returns null when there is no XML', () => {
    expect(hashReportXml(undefined)).toBeNull();
    expect(hashReportXml('')).toBeNull();
  });
});
