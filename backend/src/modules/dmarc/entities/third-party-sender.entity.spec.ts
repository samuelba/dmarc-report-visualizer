import { ThirdPartySender } from './third-party-sender.entity';

describe('ThirdPartySender Entity', () => {
  let sender: ThirdPartySender;

  beforeEach(() => {
    sender = new ThirdPartySender();
    sender.id = 'test-id';
    sender.name = 'Test Sender';
    sender.enabled = true;
    sender.createdAt = new Date();
    sender.updatedAt = new Date();
  });

  describe('matchesDkim', () => {
    it('should return true when domain matches DKIM pattern', () => {
      sender.dkimPattern = '.*\\.google\\.com$';

      expect(sender.matchesDkim('mail.google.com')).toBe(true);
      expect(sender.matchesDkim('smtp.google.com')).toBe(true);
      expect(sender.matchesDkim('subdomain.google.com')).toBe(true);
    });

    it('should return false when domain does not match DKIM pattern', () => {
      sender.dkimPattern = '.*\\.google\\.com$';

      expect(sender.matchesDkim('google.org')).toBe(false);
      expect(sender.matchesDkim('fakegoogle.com')).toBe(false);
      expect(sender.matchesDkim('notgoogle.com')).toBe(false);
    });

    it('should be case-insensitive', () => {
      sender.dkimPattern = '.*\\.google\\.com$';

      expect(sender.matchesDkim('MAIL.GOOGLE.COM')).toBe(true);
      expect(sender.matchesDkim('Mail.Google.Com')).toBe(true);
      expect(sender.matchesDkim('mail.GOOGLE.com')).toBe(true);
    });

    it('should return false when sender is disabled', () => {
      sender.dkimPattern = '.*\\.google\\.com$';
      sender.enabled = false;

      expect(sender.matchesDkim('mail.google.com')).toBe(false);
    });

    it('should return false when dkimPattern is not set', () => {
      sender.dkimPattern = undefined;

      expect(sender.matchesDkim('mail.google.com')).toBe(false);
    });

    it('should return false when domain is empty', () => {
      sender.dkimPattern = '.*\\.google\\.com$';

      expect(sender.matchesDkim('')).toBe(false);
    });

    it('should return false when domain is null', () => {
      sender.dkimPattern = '.*\\.google\\.com$';

      expect(sender.matchesDkim(null)).toBe(false);
    });

    it('should return false when domain is undefined', () => {
      sender.dkimPattern = '.*\\.google\\.com$';

      expect(sender.matchesDkim(undefined)).toBe(false);
    });

    it('should handle complex regex patterns', () => {
      // Match any subdomain of sendgrid.net or sendgrid.com
      sender.dkimPattern = '.*\\.sendgrid\\.(net|com)$';

      expect(sender.matchesDkim('em123.sendgrid.net')).toBe(true);
      expect(sender.matchesDkim('em456.sendgrid.com')).toBe(true);
      expect(sender.matchesDkim('sendgrid.net')).toBe(false); // No subdomain
    });

    it('should handle IP-based patterns', () => {
      sender.dkimPattern = '^172\\.25[0-3]\\.';

      expect(sender.matchesDkim('172.250.1.1')).toBe(true);
      expect(sender.matchesDkim('172.253.99.255')).toBe(true);
      expect(sender.matchesDkim('172.254.1.1')).toBe(false); // Out of range
    });

    it('should return false for invalid regex pattern', () => {
      sender.dkimPattern = '[invalid(regex'; // Unclosed bracket
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = sender.matchesDkim('test.com');

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain(
        'Invalid DKIM regex pattern',
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle exact match patterns', () => {
      sender.dkimPattern = '^mailgun\\.org$';

      expect(sender.matchesDkim('mailgun.org')).toBe(true);
      expect(sender.matchesDkim('sub.mailgun.org')).toBe(false);
      expect(sender.matchesDkim('mailgun.org.fake')).toBe(false);
    });

    it('should handle wildcard patterns', () => {
      sender.dkimPattern = '.*amazonses\\.com.*';

      expect(sender.matchesDkim('amazonses.com')).toBe(true);
      expect(sender.matchesDkim('email.amazonses.com')).toBe(true);
      expect(sender.matchesDkim('amazonses.com.extra')).toBe(true);
    });
  });

  describe('matchesSpf', () => {
    it('should return true when domain matches SPF pattern', () => {
      sender.spfPattern = '^172\\.253\\.';

      expect(sender.matchesSpf('172.253.1.1')).toBe(true);
      expect(sender.matchesSpf('172.253.99.255')).toBe(true);
    });

    it('should return false when domain does not match SPF pattern', () => {
      sender.spfPattern = '^172\\.253\\.';

      expect(sender.matchesSpf('172.252.1.1')).toBe(false);
      expect(sender.matchesSpf('10.0.0.1')).toBe(false);
      expect(sender.matchesSpf('192.168.1.1')).toBe(false);
    });

    it('should be case-insensitive', () => {
      sender.spfPattern = '.*\\.OUTLOOK\\.com$';

      expect(sender.matchesSpf('smtp.outlook.com')).toBe(true);
      expect(sender.matchesSpf('SMTP.OUTLOOK.COM')).toBe(true);
      expect(sender.matchesSpf('smtp.Outlook.Com')).toBe(true);
    });

    it('should return false when sender is disabled', () => {
      sender.spfPattern = '^172\\.253\\.';
      sender.enabled = false;

      expect(sender.matchesSpf('172.253.1.1')).toBe(false);
    });

    it('should return false when spfPattern is not set', () => {
      sender.spfPattern = undefined;

      expect(sender.matchesSpf('172.253.1.1')).toBe(false);
    });

    it('should return false when domain is empty', () => {
      sender.spfPattern = '^172\\.253\\.';

      expect(sender.matchesSpf('')).toBe(false);
    });

    it('should return false when domain is null', () => {
      sender.spfPattern = '^172\\.253\\.';

      expect(sender.matchesSpf(null)).toBe(false);
    });

    it('should return false when domain is undefined', () => {
      sender.spfPattern = '^172\\.253\\.';

      expect(sender.matchesSpf(undefined)).toBe(false);
    });

    it('should handle CIDR-like patterns', () => {
      sender.spfPattern = '^(40\\.9[0-1]\\.|40\\.92\\.)';

      expect(sender.matchesSpf('40.90.1.1')).toBe(true);
      expect(sender.matchesSpf('40.91.255.255')).toBe(true);
      expect(sender.matchesSpf('40.92.0.0')).toBe(true);
      expect(sender.matchesSpf('40.93.0.0')).toBe(false);
    });

    it('should handle domain-based SPF patterns', () => {
      sender.spfPattern = '.*\\.spf\\.protection\\.outlook\\.com$';

      expect(sender.matchesSpf('eur01.spf.protection.outlook.com')).toBe(true);
      expect(sender.matchesSpf('nam10.spf.protection.outlook.com')).toBe(true);
      expect(sender.matchesSpf('outlook.com')).toBe(false);
    });

    it('should return false for invalid regex pattern', () => {
      sender.spfPattern = '[invalid(regex'; // Unclosed bracket
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = sender.matchesSpf('172.253.1.1');

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain(
        'Invalid SPF regex pattern',
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle multiple IP range patterns', () => {
      sender.spfPattern = '^(172\\.253\\.|209\\.85\\.|64\\.233\\.)';

      expect(sender.matchesSpf('172.253.1.1')).toBe(true);
      expect(sender.matchesSpf('209.85.200.1')).toBe(true);
      expect(sender.matchesSpf('64.233.160.1')).toBe(true);
      expect(sender.matchesSpf('10.0.0.1')).toBe(false);
    });
  });

  describe('both patterns', () => {
    it('should allow matching on both DKIM and SPF independently', () => {
      sender.dkimPattern = '.*\\.google\\.com$';
      sender.spfPattern = '^172\\.253\\.';

      expect(sender.matchesDkim('mail.google.com')).toBe(true);
      expect(sender.matchesSpf('172.253.1.1')).toBe(true);

      expect(sender.matchesDkim('172.253.1.1')).toBe(false);
      expect(sender.matchesSpf('mail.google.com')).toBe(false);
    });

    it('should work when only DKIM pattern is set', () => {
      sender.dkimPattern = '.*\\.sendgrid\\.net$';
      sender.spfPattern = undefined;

      expect(sender.matchesDkim('em123.sendgrid.net')).toBe(true);
      expect(sender.matchesSpf('any.domain.com')).toBe(false);
    });

    it('should work when only SPF pattern is set', () => {
      sender.dkimPattern = undefined;
      sender.spfPattern = '^167\\.89\\.';

      expect(sender.matchesDkim('any.domain.com')).toBe(false);
      expect(sender.matchesSpf('167.89.1.1')).toBe(true);
    });

    it('should disable both when sender is disabled', () => {
      sender.dkimPattern = '.*\\.test\\.com$';
      sender.spfPattern = '^10\\.';
      sender.enabled = false;

      expect(sender.matchesDkim('mail.test.com')).toBe(false);
      expect(sender.matchesSpf('10.0.0.1')).toBe(false);
    });
  });

  describe('real-world patterns', () => {
    it('should match SendGrid patterns', () => {
      sender.dkimPattern = '.*\\.sendgrid\\.(net|com)$';
      sender.spfPattern = '^(167\\.89\\.|168\\.245\\.)';

      expect(sender.matchesDkim('em1234.sendgrid.net')).toBe(true);
      expect(sender.matchesDkim('o1.email.sendgrid.com')).toBe(true);
      expect(sender.matchesSpf('167.89.1.1')).toBe(true);
      expect(sender.matchesSpf('168.245.1.1')).toBe(true);
    });

    it('should match Mailgun patterns', () => {
      sender.dkimPattern = '.*\\.mailgun\\.(org|net|com)$';
      sender.spfPattern = '^(69\\.72\\.|198\\.61\\.)';

      expect(sender.matchesDkim('mg.mailgun.org')).toBe(true);
      expect(sender.matchesSpf('69.72.1.1')).toBe(true);
    });

    it('should match Microsoft 365 patterns', () => {
      sender.dkimPattern = '.*\\.onmicrosoft\\.com$';
      sender.spfPattern = '^40\\.';

      expect(sender.matchesDkim('tenant.mail.onmicrosoft.com')).toBe(true);
      expect(sender.matchesSpf('40.92.1.1')).toBe(true);
    });

    it('should match Google Workspace patterns', () => {
      sender.dkimPattern = '.*\\.google\\.com$';
      sender.spfPattern = '^(172\\.253\\.|209\\.85\\.)';

      expect(sender.matchesDkim('mail-sor-f41.google.com')).toBe(true);
      expect(sender.matchesSpf('172.253.63.109')).toBe(true);
      expect(sender.matchesSpf('209.85.220.41')).toBe(true);
    });
  });
});
