import { minifyXml } from './xml-minifier.util';

describe('minifyXml', () => {
  it('should minify formatted XML', () => {
    const formattedXml = `<?xml version="1.0" encoding="UTF-8"?>
<feedback>
  <report_metadata>
    <org_name>google.com</org_name>
    <email>noreply-dmarc-support@google.com</email>
    <report_id>12345</report_id>
  </report_metadata>
  <record>
    <row>
      <source_ip>192.168.1.1</source_ip>
      <count>1</count>
    </row>
  </record>
</feedback>`;

    const minified = minifyXml(formattedXml);

    // Should have no unnecessary whitespace
    expect(minified).not.toContain('\n  ');
    expect(minified).not.toContain('  <');
    // Should be significantly smaller
    expect(minified.length).toBeLessThan(formattedXml.length);
    // Should still contain the actual data
    expect(minified).toContain('<org_name>google.com</org_name>');
    expect(minified).toContain('<source_ip>192.168.1.1</source_ip>');
  });

  it('should handle already minified XML', () => {
    const minifiedXml =
      '<?xml version="1.0"?><root><child>value</child></root>';

    const result = minifyXml(minifiedXml);

    // Should return valid XML
    expect(result).toContain('<root>');
    expect(result).toContain('<child>value</child>');
  });

  it('should return original XML if minification fails', () => {
    const invalidXml = 'not valid xml <unclosed';

    const result = minifyXml(invalidXml);

    // Should return original when parsing fails
    expect(result).toBe(invalidXml);
  });

  it('should handle empty string', () => {
    const result = minifyXml('');
    expect(result).toBe('');
  });

  it('should preserve XML content while removing formatting', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feedback>
  <version>1.0</version>
  <report_metadata>
    <org_name>Example Corp</org_name>
    <email>dmarc@example.com</email>
    <extra_contact_info>http://example.com/dmarc</extra_contact_info>
    <report_id>1234567890</report_id>
    <date_range>
      <begin>1609459200</begin>
      <end>1609545600</end>
    </date_range>
  </report_metadata>
  <policy_published>
    <domain>example.com</domain>
    <adkim>r</adkim>
    <aspf>r</aspf>
    <p>none</p>
    <sp>none</sp>
    <pct>100</pct>
  </policy_published>
  <record>
    <row>
      <source_ip>203.0.113.1</source_ip>
      <count>5</count>
      <policy_evaluated>
        <disposition>none</disposition>
        <dkim>pass</dkim>
        <spf>pass</spf>
      </policy_evaluated>
    </row>
    <identifiers>
      <header_from>example.com</header_from>
    </identifiers>
    <auth_results>
      <dkim>
        <domain>example.com</domain>
        <result>pass</result>
        <selector>default</selector>
      </dkim>
      <spf>
        <domain>example.com</domain>
        <result>pass</result>
      </spf>
    </auth_results>
  </record>
</feedback>`;

    const minified = minifyXml(xml);

    // Verify all content is preserved
    expect(minified).toContain('<org_name>Example Corp</org_name>');
    expect(minified).toContain('<report_id>1234567890</report_id>');
    expect(minified).toContain('<source_ip>203.0.113.1</source_ip>');
    expect(minified).toContain('<count>5</count>');
    expect(minified).toContain('<disposition>none</disposition>');
    expect(minified).toContain('<dkim>pass</dkim>');
    expect(minified).toContain('<spf>pass</spf>');
    expect(minified).toContain('<selector>default</selector>');

    // Verify it's actually smaller
    expect(minified.length).toBeLessThan(xml.length * 0.8); // At least 20% smaller
  });
});
