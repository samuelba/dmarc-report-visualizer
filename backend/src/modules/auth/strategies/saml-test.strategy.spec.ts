import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SamlTestStrategy } from './saml-test.strategy';
import { SamlService } from '../services/saml.service';
import { Profile } from '@node-saml/passport-saml';

describe('SamlTestStrategy', () => {
  let strategy: SamlTestStrategy;
  let samlService: SamlService;

  const mockSamlConfig = {
    id: 'config-uuid-123',
    enabled: false, // Test mode should work even when disabled
    idpEntityId: 'https://idp.example.com',
    idpSsoUrl: 'https://idp.example.com/sso',
    idpCertificate: 'MIIDdDCCAlygAwIBAgIGAXoTlpQwDQYJKoZIhvcNAQEL',
    spEntityId: 'dmarc-app',
    spAcsUrl: 'https://app.example.com/auth/saml/callback',
    idpMetadataXml: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    updatedBy: 'user-123',
    disablePasswordLogin: false,
  };

  const mockSamlProfile: Profile = {
    issuer: 'https://idp.example.com',
    sessionIndex: 'session-123',
    nameID: 'user@example.com',
    nameIDFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    ID: 'assertion-123',
    notOnOrAfter: new Date(Date.now() + 300000).toISOString(),
  } as Profile;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SamlTestStrategy,
        {
          provide: SamlService,
          useValue: {
            getConfig: jest.fn(),
            getConfigFresh: jest.fn(),
            validateSamlAssertion: jest.fn(),
            generateTestNonce: jest.fn().mockResolvedValue('test-nonce-123'),
            createFreshSamlOptions: jest.fn((existingOptions, config) => ({
              ...existingOptions,
              entryPoint: config.idpSsoUrl,
              idpCert: config.idpCertificate,
              issuer: config.spEntityId,
              callbackUrl: config.spAcsUrl,
            })),
            createFreshSamlInstance: jest.fn((freshOptions) => {
              // Mock SAML instance
              return {
                options: freshOptions,
              };
            }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'SAML_ENTITY_ID') {
                return 'dmarc-app';
              }
              if (key === 'SAML_ACS_URL') {
                return 'https://app.example.com/auth/saml/callback';
              }
              if (key === 'SAML_DISABLE_SIGNATURE_VALIDATION') {
                return undefined;
              }
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    strategy = module.get<SamlTestStrategy>(SamlTestStrategy);
    samlService = module.get<SamlService>(SamlService);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('authenticate', () => {
    it('should load fresh configuration from database and generate nonce', async () => {
      jest
        .spyOn(samlService, 'getConfigFresh')
        .mockResolvedValue(mockSamlConfig);
      jest
        .spyOn(samlService, 'generateTestNonce')
        .mockResolvedValue('secure-nonce-abc123');

      const mockReq = {} as any;
      const mockOptions = {} as any;

      // Mock the parent authenticate method to prevent actual SAML flow
      const parentAuthenticateSpy = jest
        .spyOn(
          Object.getPrototypeOf(SamlTestStrategy.prototype),
          'authenticate',
        )
        .mockImplementation(() => Promise.resolve());

      strategy.authenticate(mockReq, mockOptions);

      // Wait for the async config loading to complete
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(samlService.getConfigFresh).toHaveBeenCalled();
      expect(samlService.generateTestNonce).toHaveBeenCalled();
      expect(parentAuthenticateSpy).toHaveBeenCalledWith(mockReq, {
        ...mockOptions,
        additionalParams: {
          RelayState: 'testMode=true&nonce=secure-nonce-abc123',
        },
      });
    });

    it('should bypass SAML enabled check', async () => {
      // Config has enabled: false, but test mode should still work
      const disabledConfig = { ...mockSamlConfig, enabled: false };
      jest
        .spyOn(samlService, 'getConfigFresh')
        .mockResolvedValue(disabledConfig);

      const mockReq = {} as any;

      // Mock the parent authenticate method
      const parentAuthenticateSpy = jest
        .spyOn(
          Object.getPrototypeOf(SamlTestStrategy.prototype),
          'authenticate',
        )
        .mockImplementation(() => Promise.resolve());

      strategy.authenticate(mockReq);

      // Wait for the async config loading to complete
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Should still call parent authenticate even though enabled is false
      expect(parentAuthenticateSpy).toHaveBeenCalled();
    });

    it('should update strategy configuration with IdP details', async () => {
      jest
        .spyOn(samlService, 'getConfigFresh')
        .mockResolvedValue(mockSamlConfig);

      const mockReq = {} as any;

      // Mock the parent authenticate method
      jest
        .spyOn(
          Object.getPrototypeOf(SamlTestStrategy.prototype),
          'authenticate',
        )
        .mockImplementation(() => Promise.resolve());

      strategy.authenticate(mockReq);

      // Wait for the async config loading to complete
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Verify that the strategy's internal SAML options were updated
      expect((strategy as any)._saml.options.entryPoint).toBe(
        mockSamlConfig.idpSsoUrl,
      );
      // Check both cert and idpCert as different versions may use different property names
      const certValue =
        (strategy as any)._saml.options.cert ||
        (strategy as any)._saml.options.idpCert;
      expect(certValue).toBe(mockSamlConfig.idpCertificate);
      expect((strategy as any)._saml.options.issuer).toBe(
        mockSamlConfig.spEntityId,
      );
      expect((strategy as any)._saml.options.callbackUrl).toBe(
        mockSamlConfig.spAcsUrl,
      );
    });
  });

  describe('validate', () => {
    beforeEach(() => {
      jest.spyOn(samlService, 'validateSamlAssertion').mockResolvedValue({
        valid: true,
      });
    });

    it('should validate SAML assertion correctly', async () => {
      const result = await strategy.validate(mockSamlProfile);

      expect(samlService.validateSamlAssertion).toHaveBeenCalledWith(
        mockSamlProfile,
        true, // bypassCache parameter
      );
      expect(result).toBeDefined();
      expect(result.email).toBe('user@example.com');
    });

    it('should extract email from profile nameID', async () => {
      const result = await strategy.validate(mockSamlProfile);

      expect(result).toBeDefined();
      expect(result.email).toBe('user@example.com');
    });

    it('should extract email from profile email attribute', async () => {
      const profileWithEmail = {
        ...mockSamlProfile,
        email: 'test@example.com',
      } as unknown as Profile;
      // Remove nameID to test email fallback
      delete (profileWithEmail as any).nameID;

      const result = await strategy.validate(profileWithEmail);

      expect(result).toBeDefined();
      expect(result.email).toBe('test@example.com');
    });

    it('should return mock user object with email only', async () => {
      const result = await strategy.validate(mockSamlProfile);

      expect(result).toBeDefined();
      expect(result.email).toBe('user@example.com');
      // Should not have other user properties (mock object)
      expect(result.id).toBeUndefined();
      expect(result.passwordHash).toBeUndefined();
    });

    it('should throw error when assertion validation fails', async () => {
      jest.spyOn(samlService, 'validateSamlAssertion').mockResolvedValue({
        valid: false,
        errors: ['Invalid audience', 'Assertion expired'],
      });

      await expect(strategy.validate(mockSamlProfile)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate(mockSamlProfile)).rejects.toThrow(
        'SAML test failed: Invalid audience, Assertion expired',
      );
    });

    it('should throw error when no email in assertion', async () => {
      const profileWithoutEmail = {
        ...mockSamlProfile,
      } as unknown as Profile;
      // Remove both nameID and email to test error case
      delete (profileWithoutEmail as any).nameID;
      delete (profileWithoutEmail as any).email;

      await expect(strategy.validate(profileWithoutEmail)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate(profileWithoutEmail)).rejects.toThrow(
        'SAML test failed: No email in assertion',
      );
    });

    it('should handle validation errors gracefully', async () => {
      jest.spyOn(samlService, 'validateSamlAssertion').mockResolvedValue({
        valid: false,
        errors: ['Unknown validation error'],
      });

      await expect(strategy.validate(mockSamlProfile)).rejects.toThrow(
        'SAML test failed: Unknown validation error',
      );
    });

    it('should handle missing validation errors', async () => {
      jest.spyOn(samlService, 'validateSamlAssertion').mockResolvedValue({
        valid: false,
      });

      await expect(strategy.validate(mockSamlProfile)).rejects.toThrow(
        'SAML test failed: Unknown validation error',
      );
    });

    it('should wrap non-UnauthorizedException errors', async () => {
      jest
        .spyOn(samlService, 'validateSamlAssertion')
        .mockRejectedValue(new Error('Database connection failed'));

      await expect(strategy.validate(mockSamlProfile)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate(mockSamlProfile)).rejects.toThrow(
        'SAML test failed: Database connection failed',
      );
    });
  });
});
