import { Test, TestingModule } from '@nestjs/testing';
import { ForwardingDetectionService } from './forwarding-detection.service';
import { ThirdPartySenderService } from './third-party-sender.service';
import { DmarcRecord } from '../entities/dmarc-record.entity';
import { DkimResult } from '../entities/dkim-result.entity';
import { SpfResult } from '../entities/spf-result.entity';
import { PolicyOverrideReason } from '../entities/policy-override-reason.entity';

describe('ForwardingDetectionService', () => {
  let service: ForwardingDetectionService;
  let _thirdPartySenderService: ThirdPartySenderService;

  const mockThirdPartySenderService = {
    isDkimThirdParty: jest.fn(),
    isSpfThirdParty: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ForwardingDetectionService,
        {
          provide: ThirdPartySenderService,
          useValue: mockThirdPartySenderService,
        },
      ],
    }).compile();

    service = module.get<ForwardingDetectionService>(
      ForwardingDetectionService,
    );
    _thirdPartySenderService = module.get<ThirdPartySenderService>(
      ThirdPartySenderService,
    );

    // Default: not third-party
    mockThirdPartySenderService.isDkimThirdParty.mockResolvedValue({
      isThirdParty: false,
    });
    mockThirdPartySenderService.isSpfThirdParty.mockResolvedValue({
      isThirdParty: false,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('detectForwarding', () => {
    it('should return true when explicitly marked as forwarded in policy override', async () => {
      const record: Partial<DmarcRecord> = {
        headerFrom: 'example.com',
        policyOverrideReasons: [
          {
            type: 'forwarded',
            comment: 'Message forwarded by user',
          } as PolicyOverrideReason,
        ],
      };

      const result = await service.detectForwarding(record);

      expect(result.isForwarded).toBe(true);
      expect(result.reason).toContain('Explicitly marked as forwarded');
      expect(result.reason).toContain('Message forwarded by user');
    });

    it('should return false when third-party sender is detected', async () => {
      mockThirdPartySenderService.isDkimThirdParty.mockResolvedValue({
        isThirdParty: true,
      });

      const record: Partial<DmarcRecord> = {
        headerFrom: 'example.com',
        dkimResults: [
          {
            domain: 'sendgrid.net',
            result: 'pass',
          } as DkimResult,
        ],
      };

      const result = await service.detectForwarding(record);

      expect(result.isForwarded).toBe(false);
      expect(result.reason).toBeNull();
      expect(mockThirdPartySenderService.isDkimThirdParty).toHaveBeenCalledWith(
        'sendgrid.net',
      );
    });

    it('should return null when headerFrom is missing and not a third-party', async () => {
      const record: Partial<DmarcRecord> = {
        dkimResults: [
          {
            domain: 'some-domain.com',
            result: 'pass',
          } as DkimResult,
        ],
      };

      const result = await service.detectForwarding(record);

      expect(result.isForwarded).toBeNull();
      expect(result.reason).toBeNull();
    });

    it('should detect forwarding with modified email (original DKIM fail, forwarder pass)', async () => {
      const record: Partial<DmarcRecord> = {
        headerFrom: 'example.com',
        dkimResults: [
          {
            domain: 'example.com',
            result: 'fail',
          } as DkimResult,
          {
            domain: 'forwarder.com',
            result: 'pass',
          } as DkimResult,
        ],
      };

      const result = await service.detectForwarding(record);

      expect(result.isForwarded).toBe(true);
      expect(result.reason).toContain('Email forwarded with modifications');
      expect(result.reason).toContain('original DKIM signature broken');
      expect(result.reason).toContain('forwarder.com');
    });

    it('should detect forwarding without modifications (original DKIM pass, forwarder pass)', async () => {
      const record: Partial<DmarcRecord> = {
        headerFrom: 'example.com',
        dkimResults: [
          {
            domain: 'example.com',
            result: 'pass',
          } as DkimResult,
          {
            domain: 'forwarder.com',
            result: 'pass',
          } as DkimResult,
        ],
      };

      const result = await service.detectForwarding(record);

      expect(result.isForwarded).toBe(true);
      expect(result.reason).toContain('Email forwarded without modifications');
      expect(result.reason).toContain('original DKIM signature preserved');
      expect(result.reason).toContain('forwarder.com');
    });

    it('should detect forwarding with SPF from forwarder', async () => {
      const record: Partial<DmarcRecord> = {
        headerFrom: 'example.com',
        dkimResults: [
          {
            domain: 'example.com',
            result: 'fail',
          } as DkimResult,
        ],
        spfResults: [
          {
            domain: 'forwarder.com',
            result: 'pass',
          } as SpfResult,
        ],
      };

      const result = await service.detectForwarding(record);

      expect(result.isForwarded).toBe(true);
      expect(result.reason).toContain('Email forwarded with modifications');
      expect(result.reason).toContain('forwarder.com');
    });

    it('should detect known forwarder even without passing auth', async () => {
      const record: Partial<DmarcRecord> = {
        headerFrom: 'example.com',
        dkimResults: [
          {
            domain: 'example.com',
            result: 'fail',
          } as DkimResult,
          {
            domain: 'onmicrosoft.com',
            result: 'fail',
          } as DkimResult,
        ],
      };

      const result = await service.detectForwarding(record);

      expect(result.isForwarded).toBe(true);
      expect(result.reason).toContain('known forwarding service');
      expect(result.reason).toContain('onmicrosoft.com');
    });

    it('should return false when only original DKIM exists (no forwarder)', async () => {
      const record: Partial<DmarcRecord> = {
        headerFrom: 'example.com',
        dkimResults: [
          {
            domain: 'example.com',
            result: 'pass',
          } as DkimResult,
        ],
      };

      const result = await service.detectForwarding(record);

      expect(result.isForwarded).toBe(false);
      expect(result.reason).toBeNull();
    });

    it('should return false when no original DKIM exists (likely spam)', async () => {
      const record: Partial<DmarcRecord> = {
        headerFrom: 'example.com',
        dkimResults: [
          {
            domain: 'spammer.com',
            result: 'pass',
          } as DkimResult,
        ],
      };

      const result = await service.detectForwarding(record);

      expect(result.isForwarded).toBe(false);
      expect(result.reason).toBeNull();
    });

    it('should return false when only SPF exists (no DKIM)', async () => {
      const record: Partial<DmarcRecord> = {
        headerFrom: 'example.com',
        dkimResults: [],
        spfResults: [
          {
            domain: 'example.com',
            result: 'pass',
          } as SpfResult,
        ],
      };

      const result = await service.detectForwarding(record);

      expect(result.isForwarded).toBe(false);
      expect(result.reason).toBeNull();
    });

    it('should return null when no auth results exist', async () => {
      const record: Partial<DmarcRecord> = {
        headerFrom: 'example.com',
        dkimResults: [],
        spfResults: [],
      };

      const result = await service.detectForwarding(record);

      expect(result.isForwarded).toBeNull();
      expect(result.reason).toBeNull();
    });

    it('should handle subdomain matching correctly', async () => {
      const record: Partial<DmarcRecord> = {
        headerFrom: 'mail.example.com',
        dkimResults: [
          {
            domain: 'id.example.com',
            result: 'pass',
          } as DkimResult,
        ],
      };

      const result = await service.detectForwarding(record);

      // Both should match to base domain example.com
      expect(result.isForwarded).toBe(false);
      expect(result.reason).toBeNull();
    });

    it('should detect forwarding with subdomain differences', async () => {
      const record: Partial<DmarcRecord> = {
        headerFrom: 'example.com',
        dkimResults: [
          {
            domain: 'example.com',
            result: 'fail',
          } as DkimResult,
          {
            domain: 'mail.forwarder.com',
            result: 'pass',
          } as DkimResult,
        ],
      };

      const result = await service.detectForwarding(record);

      expect(result.isForwarded).toBe(true);
      expect(result.reason).toContain('forwarded');
    });

    it('should handle multiple policy override reasons', async () => {
      const record: Partial<DmarcRecord> = {
        headerFrom: 'example.com',
        policyOverrideReasons: [
          {
            type: 'local_policy',
            comment: 'Some other reason',
          } as PolicyOverrideReason,
          {
            type: 'forwarded',
            comment: 'User forwarded',
          } as PolicyOverrideReason,
        ],
      };

      const result = await service.detectForwarding(record);

      expect(result.isForwarded).toBe(true);
      expect(result.reason).toContain('Explicitly marked as forwarded');
    });

    it('should handle errors gracefully', async () => {
      mockThirdPartySenderService.isDkimThirdParty.mockRejectedValue(
        new Error('Service error'),
      );

      const record: Partial<DmarcRecord> = {
        headerFrom: 'example.com',
        dkimResults: [
          {
            domain: 'example.com',
            result: 'pass',
          } as DkimResult,
        ],
      };

      const result = await service.detectForwarding(record);

      expect(result.isForwarded).toBeNull();
      expect(result.reason).toBeNull();
    });

    it('should detect ImprovMX as known forwarder', async () => {
      const record: Partial<DmarcRecord> = {
        headerFrom: 'example.com',
        dkimResults: [
          {
            domain: 'example.com',
            result: 'fail',
          } as DkimResult,
          {
            domain: 'improvmx.com',
            result: 'fail',
          } as DkimResult,
        ],
      };

      const result = await service.detectForwarding(record);

      expect(result.isForwarded).toBe(true);
      expect(result.reason).toContain('known forwarding service');
      expect(result.reason).toContain('improvmx.com');
    });

    it('should prioritize explicit forwarded flag over third-party detection', async () => {
      mockThirdPartySenderService.isDkimThirdParty.mockResolvedValue({
        isThirdParty: true,
      });

      const record: Partial<DmarcRecord> = {
        headerFrom: 'example.com',
        policyOverrideReasons: [
          {
            type: 'forwarded',
            comment: 'Explicit forwarding',
          } as PolicyOverrideReason,
        ],
        dkimResults: [
          {
            domain: 'sendgrid.net',
            result: 'pass',
          } as DkimResult,
        ],
      };

      const result = await service.detectForwarding(record);

      // Should detect as forwarded due to explicit flag, even though DKIM is third-party
      expect(result.isForwarded).toBe(true);
      expect(result.reason).toContain('Explicitly marked as forwarded');
    });

    it('should handle likely forwarding case with unclear auth results', async () => {
      const record: Partial<DmarcRecord> = {
        headerFrom: 'example.com',
        dkimResults: [
          {
            domain: 'example.com',
            result: 'fail',
          } as DkimResult,
          {
            domain: 'random-domain-xyz.com',
            result: 'fail',
          } as DkimResult,
        ],
      };

      const result = await service.detectForwarding(record);

      expect(result.isForwarded).toBe(true);
      expect(result.reason).toContain('likely forwarded');
      expect(result.reason).toContain(
        'DKIM from both original and forwarding domains',
      );
    });

    it('should handle multi-part TLD domains correctly', async () => {
      const record: Partial<DmarcRecord> = {
        headerFrom: 'example.co.uk',
        dkimResults: [
          {
            domain: 'mail.example.co.uk',
            result: 'pass',
          } as DkimResult,
        ],
      };

      const result = await service.detectForwarding(record);

      // Both should match to base domain example.co.uk
      expect(result.isForwarded).toBe(false);
      expect(result.reason).toBeNull();
    });

    it('should detect SPF third-party sender', async () => {
      mockThirdPartySenderService.isSpfThirdParty.mockResolvedValue({
        isThirdParty: true,
      });

      const record: Partial<DmarcRecord> = {
        headerFrom: 'example.com',
        spfResults: [
          {
            domain: 'mailgun.org',
            result: 'pass',
          } as SpfResult,
        ],
      };

      const result = await service.detectForwarding(record);

      expect(result.isForwarded).toBe(false);
      expect(result.reason).toBeNull();
      expect(mockThirdPartySenderService.isSpfThirdParty).toHaveBeenCalledWith(
        'mailgun.org',
      );
    });

    it('should handle empty DKIM domain gracefully', async () => {
      const record: Partial<DmarcRecord> = {
        headerFrom: 'example.com',
        dkimResults: [
          {
            domain: '',
            result: 'pass',
          } as DkimResult,
        ],
      };

      const result = await service.detectForwarding(record);

      // Empty domain should be filtered out, resulting in no auth results
      expect(result.isForwarded).toBe(false);
      expect(result.reason).toBeNull();
    });

    it('should handle undefined DKIM domain gracefully', async () => {
      const record: Partial<DmarcRecord> = {
        headerFrom: 'example.com',
        dkimResults: [
          {
            domain: undefined,
            result: 'pass',
          } as unknown as DkimResult,
        ],
      };

      const result = await service.detectForwarding(record);

      // Undefined domain should be filtered out, resulting in no auth results
      expect(result.isForwarded).toBe(false);
      expect(result.reason).toBeNull();
    });
  });
});
