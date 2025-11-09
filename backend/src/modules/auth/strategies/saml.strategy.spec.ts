import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SamlStrategy } from './saml.strategy';
import { SamlService } from '../services/saml.service';
import { User } from '../entities/user.entity';
import { Profile } from '@node-saml/passport-saml';

describe('SamlStrategy', () => {
  let strategy: SamlStrategy;
  let samlService: SamlService;

  const mockSamlConfig = {
    id: 'config-uuid-123',
    enabled: true,
    idpEntityId: 'https://idp.example.com',
    idpSsoUrl: 'https://idp.example.com/sso',
    idpCertificate: 'MIIDdDCCAlygAwIBAgIGAXoTl...',
    spEntityId: 'dmarc-app',
    spAcsUrl: 'https://app.example.com/auth/saml/callback',
    idpMetadataXml: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    updatedBy: 'user-123',
  };

  const mockUser: User = {
    id: 'user-uuid-123',
    email: 'user@example.com',
    passwordHash: '',
    authProvider: 'saml',
    organizationId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    refreshTokens: [],
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
        SamlStrategy,
        {
          provide: SamlService,
          useValue: {
            getConfig: jest.fn(),
            validateSamlAssertion: jest.fn(),
            handleSamlLogin: jest.fn(),
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
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    strategy = module.get<SamlStrategy>(SamlStrategy);
    samlService = module.get<SamlService>(SamlService);
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('authenticate', () => {
    it('should load configuration from database', async () => {
      jest.spyOn(samlService, 'getConfig').mockResolvedValue(mockSamlConfig);

      const mockReq = {} as any;
      const mockOptions = {} as any;

      // Mock the parent authenticate method to prevent actual SAML flow
      const parentAuthenticateSpy = jest
        .spyOn(Object.getPrototypeOf(SamlStrategy.prototype), 'authenticate')
        .mockImplementation(() => Promise.resolve());

      strategy.authenticate(mockReq, mockOptions);

      // Wait for the async config loading to complete
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(samlService.getConfig).toHaveBeenCalled();
      expect(parentAuthenticateSpy).toHaveBeenCalledWith(mockReq, mockOptions);
    });

    it('should update strategy configuration with IdP details', async () => {
      jest.spyOn(samlService, 'getConfig').mockResolvedValue(mockSamlConfig);

      const mockReq = {} as any;

      // Mock the parent authenticate method
      jest
        .spyOn(Object.getPrototypeOf(SamlStrategy.prototype), 'authenticate')
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
      jest.spyOn(samlService, 'handleSamlLogin').mockResolvedValue(mockUser);
    });

    it('should call handleSamlLogin with SAML profile', async () => {
      const result = await strategy.validate(mockSamlProfile);

      expect(samlService.handleSamlLogin).toHaveBeenCalledWith(mockSamlProfile);
      expect(result).toEqual(mockUser);
    });

    it('should return User entity', async () => {
      const result = await strategy.validate(mockSamlProfile);

      expect(result).toBeDefined();
      expect(result.id).toBe(mockUser.id);
      expect(result.email).toBe(mockUser.email);
      expect(result.authProvider).toBe('saml');
    });

    it('should validate SAML assertion before handling login', async () => {
      await strategy.validate(mockSamlProfile);

      expect(samlService.validateSamlAssertion).toHaveBeenCalledWith(
        mockSamlProfile,
      );
      expect(samlService.handleSamlLogin).toHaveBeenCalled();
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
        'Invalid audience, Assertion expired',
      );
    });

    it('should throw error when handleSamlLogin fails', async () => {
      jest
        .spyOn(samlService, 'handleSamlLogin')
        .mockRejectedValue(new UnauthorizedException('User creation failed'));

      await expect(strategy.validate(mockSamlProfile)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate(mockSamlProfile)).rejects.toThrow(
        'User creation failed',
      );
    });

    it('should handle validation errors gracefully', async () => {
      jest.spyOn(samlService, 'validateSamlAssertion').mockResolvedValue({
        valid: false,
        errors: ['Unknown validation error'],
      });

      await expect(strategy.validate(mockSamlProfile)).rejects.toThrow(
        'SAML authentication failed: Unknown validation error',
      );
    });

    it('should handle missing validation errors', async () => {
      jest.spyOn(samlService, 'validateSamlAssertion').mockResolvedValue({
        valid: false,
      });

      await expect(strategy.validate(mockSamlProfile)).rejects.toThrow(
        'SAML authentication failed: Unknown validation error',
      );
    });

    it('should wrap non-UnauthorizedException errors', async () => {
      jest
        .spyOn(samlService, 'handleSamlLogin')
        .mockRejectedValue(new Error('Database connection failed'));

      await expect(strategy.validate(mockSamlProfile)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate(mockSamlProfile)).rejects.toThrow(
        'SAML authentication failed: Database connection failed',
      );
    });
  });
});
