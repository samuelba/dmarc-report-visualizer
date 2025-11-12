import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { SamlService } from './saml.service';
import { SamlConfig } from '../entities/saml-config.entity';
import { User } from '../entities/user.entity';

describe('SamlService', () => {
  let service: SamlService;
  let repository: Repository<SamlConfig>;
  let userRepository: Repository<User>;
  let configService: ConfigService;

  const mockSamlConfig: SamlConfig = {
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
    disablePasswordLogin: false,
  };

  const validIdpMetadata = `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.example.com">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <KeyDescriptor use="signing">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <X509Certificate>MIIDdDCCAlygAwIBAgIGAXoTl</X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>
    <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.example.com/sso"/>
  </IDPSSODescriptor>
</EntityDescriptor>`;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SamlService,
        {
          provide: getRepositoryToken(SamlConfig),
          useValue: {
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
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
              if (key === 'REDIS_HOST') {
                return 'localhost';
              }
              if (key === 'REDIS_PORT') {
                return 6379;
              }
              if (key === 'REDIS_PASSWORD') {
                return 'devpassword';
              }
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SamlService>(SamlService);
    repository = module.get<Repository<SamlConfig>>(
      getRepositoryToken(SamlConfig),
    );
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    configService = module.get<ConfigService>(ConfigService);

    // Skip Redis initialization for unit tests
    // Redis functionality should be tested in e2e tests
    // await service.onModuleInit();
  });

  afterEach(async () => {
    // Skip Redis cleanup for unit tests
    // await service.onModuleDestroy();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getConfig', () => {
    it('should retrieve SAML configuration', async () => {
      jest.spyOn(repository, 'find').mockResolvedValue([mockSamlConfig]);

      const result = await service.getConfig();

      expect(result).toEqual(mockSamlConfig);
      expect(repository.find).toHaveBeenCalled();
    });

    it('should return null when no configuration exists', async () => {
      jest.spyOn(repository, 'find').mockResolvedValue([]);

      const result = await service.getConfig();

      expect(result).toBeNull();
    });
  });

  describe('createOrUpdateConfig', () => {
    it('should create new configuration with metadata XML', async () => {
      const dto = { idpMetadataXml: validIdpMetadata };
      const userId = 'user-123';

      jest.spyOn(repository, 'find').mockResolvedValue([]);
      jest.spyOn(repository, 'create').mockReturnValue(mockSamlConfig as any);
      jest.spyOn(repository, 'save').mockResolvedValue(mockSamlConfig);

      const result = await service.createOrUpdateConfig(dto, userId);

      expect(result).toEqual(mockSamlConfig);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          idpEntityId: 'https://idp.example.com',
          idpSsoUrl: 'https://idp.example.com/sso',
          idpCertificate: 'MIIDdDCCAlygAwIBAgIGAXoTl',
          spEntityId: 'dmarc-app',
          spAcsUrl: 'https://app.example.com/auth/saml/callback',
          enabled: false,
          updatedBy: userId,
        }),
      );
    });

    it('should create new configuration with manual fields', async () => {
      const dto = {
        idpEntityId: 'https://idp.example.com',
        idpSsoUrl: 'https://idp.example.com/sso',
        idpCertificate: 'MIIDdDCCAlygAwIBAgIGAXoTl',
      };
      const userId = 'user-123';

      jest.spyOn(repository, 'find').mockResolvedValue([]);
      jest.spyOn(repository, 'create').mockReturnValue(mockSamlConfig as any);
      jest.spyOn(repository, 'save').mockResolvedValue(mockSamlConfig);

      const result = await service.createOrUpdateConfig(dto, userId);

      expect(result).toEqual(mockSamlConfig);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          idpEntityId: dto.idpEntityId,
          idpSsoUrl: dto.idpSsoUrl,
          idpCertificate: dto.idpCertificate,
        }),
      );
    });

    it('should update existing configuration', async () => {
      const dto = {
        idpEntityId: 'https://new-idp.example.com',
        idpSsoUrl: 'https://new-idp.example.com/sso',
        idpCertificate: 'NewCertificate123',
      };
      const userId = 'user-456';

      jest.spyOn(repository, 'find').mockResolvedValue([mockSamlConfig]);
      jest.spyOn(repository, 'save').mockResolvedValue({
        ...mockSamlConfig,
        ...dto,
        updatedBy: userId,
      });

      const result = await service.createOrUpdateConfig(dto, userId);

      expect(result.idpEntityId).toBe(dto.idpEntityId);
      expect(result.idpSsoUrl).toBe(dto.idpSsoUrl);
      expect(result.idpCertificate).toBe(dto.idpCertificate);
      expect(repository.save).toHaveBeenCalled();
    });

    it('should throw error when manual fields are incomplete', async () => {
      const dto = {
        idpEntityId: 'https://idp.example.com',
        // Missing idpSsoUrl and idpCertificate
      };
      const userId = 'user-123';

      await expect(service.createOrUpdateConfig(dto, userId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw error when environment variables are missing', async () => {
      const dto = { idpMetadataXml: validIdpMetadata };
      const userId = 'user-123';

      jest.spyOn(configService, 'get').mockReturnValue(undefined);

      await expect(service.createOrUpdateConfig(dto, userId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('enableSaml', () => {
    it('should enable SAML when configuration exists', async () => {
      const config = { ...mockSamlConfig, enabled: false };
      jest.spyOn(repository, 'find').mockResolvedValue([config]);
      jest
        .spyOn(repository, 'save')
        .mockResolvedValue({ ...config, enabled: true });

      await service.enableSaml();

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true }),
      );
    });

    it('should throw error when configuration does not exist', async () => {
      jest.spyOn(repository, 'find').mockResolvedValue([]);

      await expect(service.enableSaml()).rejects.toThrow(NotFoundException);
    });

    it('should throw error when configuration is incomplete', async () => {
      const incompleteConfig = {
        ...mockSamlConfig,
        idpEntityId: null,
        idpSsoUrl: null,
      };
      jest.spyOn(repository, 'find').mockResolvedValue([incompleteConfig]);

      await expect(service.enableSaml()).rejects.toThrow(BadRequestException);
    });
  });

  describe('disableSaml', () => {
    it('should disable SAML when configuration exists', async () => {
      jest.spyOn(repository, 'find').mockResolvedValue([mockSamlConfig]);
      jest.spyOn(repository, 'save').mockResolvedValue({
        ...mockSamlConfig,
        enabled: false,
      });

      await service.disableSaml();

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false }),
      );
    });

    it('should throw error when configuration does not exist', async () => {
      jest.spyOn(repository, 'find').mockResolvedValue([]);

      await expect(service.disableSaml()).rejects.toThrow(NotFoundException);
    });
  });

  describe('parseIdpMetadata', () => {
    it('should extract entityId, ssoUrl, and certificate from valid metadata', async () => {
      const result = await service.parseIdpMetadata(validIdpMetadata);

      expect(result).toEqual({
        entityId: 'https://idp.example.com',
        ssoUrl: 'https://idp.example.com/sso',
        certificate: 'MIIDdDCCAlygAwIBAgIGAXoTl',
      });
    });

    it('should handle metadata with multiple SingleSignOnService entries', async () => {
      const metadataWithMultipleSso = `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.example.com">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <KeyDescriptor use="signing">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <X509Certificate>MIIDdDCCAlygAwIBAgIGAXoTl</X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>
    <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://idp.example.com/sso-post"/>
    <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.example.com/sso"/>
  </IDPSSODescriptor>
</EntityDescriptor>`;

      const result = await service.parseIdpMetadata(metadataWithMultipleSso);

      expect(result.ssoUrl).toBe('https://idp.example.com/sso-post');
    });

    it('should fail with invalid XML', async () => {
      const invalidXml = 'not valid xml';

      await expect(service.parseIdpMetadata(invalidXml)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should fail when EntityDescriptor is missing', async () => {
      const invalidMetadata = `<?xml version="1.0"?><Root></Root>`;

      await expect(service.parseIdpMetadata(invalidMetadata)).rejects.toThrow(
        'Invalid IdP metadata: Missing EntityDescriptor',
      );
    });

    it('should fail when entityID is missing', async () => {
      const invalidMetadata = `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
  <IDPSSODescriptor></IDPSSODescriptor>
</EntityDescriptor>`;

      await expect(service.parseIdpMetadata(invalidMetadata)).rejects.toThrow(
        'Invalid IdP metadata: Missing entityID',
      );
    });

    it('should fail when SingleSignOnService is missing', async () => {
      const invalidMetadata = `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.example.com">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <KeyDescriptor use="signing">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <X509Certificate>MIIDdDCCAlygAwIBAgIGAXoTl</X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>
  </IDPSSODescriptor>
</EntityDescriptor>`;

      await expect(service.parseIdpMetadata(invalidMetadata)).rejects.toThrow(
        'Invalid IdP metadata: Missing SingleSignOnService',
      );
    });

    it('should fail when X509Certificate is missing', async () => {
      const invalidMetadata = `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.example.com">
  <IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <KeyDescriptor use="signing">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data></X509Data>
      </KeyInfo>
    </KeyDescriptor>
    <SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.example.com/sso"/>
  </IDPSSODescriptor>
</EntityDescriptor>`;

      await expect(service.parseIdpMetadata(invalidMetadata)).rejects.toThrow(
        'Invalid IdP metadata: Missing X509Certificate',
      );
    });
  });

  describe('generateSpMetadata', () => {
    it('should create valid SAML 2.0 SP metadata XML', async () => {
      const result = await service.generateSpMetadata();

      expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(result).toContain('md:EntityDescriptor');
      expect(result).toContain('entityID="dmarc-app"');
      expect(result).toContain('md:SPSSODescriptor');
      expect(result).toContain('urn:oasis:names:tc:SAML:2.0:protocol');
      expect(result).toContain('md:NameIDFormat');
      expect(result).toContain(
        'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
      );
      expect(result).toContain('md:AssertionConsumerService');
      expect(result).toContain(
        'Location="https://app.example.com/auth/saml/callback"',
      );
      expect(result).toContain('index="1"');
    });

    it('should throw error when environment variables are missing', async () => {
      jest.spyOn(configService, 'get').mockReturnValue(undefined);

      await expect(service.generateSpMetadata()).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('validateSamlAssertion', () => {
    beforeEach(() => {
      jest.spyOn(repository, 'find').mockResolvedValue([mockSamlConfig]);
    });

    it('should succeed with valid assertion', async () => {
      const validAssertion = {
        audience: 'dmarc-app',
        recipient: 'https://app.example.com/auth/saml/callback',
        notBefore: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
        notOnOrAfter: new Date(Date.now() + 300000).toISOString(), // 5 minutes from now
      };

      const result = await service.validateSamlAssertion(validAssertion);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should fail with invalid audience', async () => {
      const invalidAssertion = {
        audience: 'wrong-entity-id',
        recipient: 'https://app.example.com/auth/saml/callback',
        notBefore: new Date(Date.now() - 60000).toISOString(),
        notOnOrAfter: new Date(Date.now() + 300000).toISOString(),
      };

      const result = await service.validateSamlAssertion(invalidAssertion);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid audience: expected dmarc-app');
    });

    it('should fail with invalid recipient', async () => {
      const invalidAssertion = {
        audience: 'dmarc-app',
        recipient: 'https://wrong-url.com/callback',
        notBefore: new Date(Date.now() - 60000).toISOString(),
        notOnOrAfter: new Date(Date.now() + 300000).toISOString(),
      };

      const result = await service.validateSamlAssertion(invalidAssertion);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Invalid recipient: expected https://app.example.com/auth/saml/callback',
      );
    });

    it('should fail with expired assertion (NotOnOrAfter)', async () => {
      const expiredAssertion = {
        audience: 'dmarc-app',
        recipient: 'https://app.example.com/auth/saml/callback',
        notBefore: new Date(Date.now() - 600000).toISOString(), // 10 minutes ago
        notOnOrAfter: new Date(Date.now() - 60000).toISOString(), // 1 minute ago (expired)
      };

      const result = await service.validateSamlAssertion(expiredAssertion);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Assertion expired (NotOnOrAfter)');
    });

    it('should fail with assertion not yet valid (NotBefore)', async () => {
      const futureAssertion = {
        audience: 'dmarc-app',
        recipient: 'https://app.example.com/auth/saml/callback',
        notBefore: new Date(Date.now() + 60000).toISOString(), // 1 minute from now
        notOnOrAfter: new Date(Date.now() + 300000).toISOString(),
      };

      const result = await service.validateSamlAssertion(futureAssertion);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Assertion not yet valid (NotBefore)');
    });

    it('should handle multiple validation errors', async () => {
      const invalidAssertion = {
        audience: 'wrong-entity-id',
        recipient: 'https://wrong-url.com/callback',
        notBefore: new Date(Date.now() + 60000).toISOString(),
        notOnOrAfter: new Date(Date.now() - 60000).toISOString(),
      };

      const result = await service.validateSamlAssertion(invalidAssertion);

      expect(result.valid).toBe(false);
      expect(result.errors?.length).toBeGreaterThan(1);
    });

    it('should handle array of audiences', async () => {
      const assertionWithMultipleAudiences = {
        audience: ['dmarc-app', 'other-app'],
        recipient: 'https://app.example.com/auth/saml/callback',
        notBefore: new Date(Date.now() - 60000).toISOString(),
        notOnOrAfter: new Date(Date.now() + 300000).toISOString(),
      };

      const result = await service.validateSamlAssertion(
        assertionWithMultipleAudiences,
      );

      expect(result.valid).toBe(true);
    });
  });

  // TODO: Move these Redis tests to e2e test suite
  // These tests require actual Redis connection and should not be in unit tests
  describe.skip('checkAssertionReplay', () => {
    it('should return false for new assertion ID', async () => {
      const result = await service.checkAssertionReplay('new-assertion-id');

      expect(result).toBe(false);
    });

    it('should detect duplicate assertion IDs', async () => {
      const assertionId = 'duplicate-assertion-id';
      const expiresAt = new Date(Date.now() + 300000);

      await service.markAssertionProcessed(assertionId, expiresAt);
      const result = await service.checkAssertionReplay(assertionId);

      expect(result).toBe(true);
    });

    it('should handle empty assertion ID', async () => {
      const result = await service.checkAssertionReplay('');

      expect(result).toBe(false);
    });
  });

  // TODO: Move these Redis tests to e2e test suite
  describe.skip('markAssertionProcessed', () => {
    it('should cache assertion ID with expiration', async () => {
      const assertionId = 'test-assertion-id';
      const expiresAt = new Date(Date.now() + 300000);

      await service.markAssertionProcessed(assertionId, expiresAt);
      const isReplay = await service.checkAssertionReplay(assertionId);

      expect(isReplay).toBe(true);
    });

    it('should handle empty assertion ID gracefully', async () => {
      const expiresAt = new Date(Date.now() + 300000);

      await expect(
        service.markAssertionProcessed('', expiresAt),
      ).resolves.not.toThrow();
    });
  });

  describe('handleSamlLogin', () => {
    let testCounter = 0;

    const createMockSamlProfile = () => ({
      nameID: 'user@example.com',
      email: 'user@example.com',
      ID: `assertion-${Date.now()}-${testCounter++}`, // Unique ID per test
      notOnOrAfter: new Date(Date.now() + 300000).toISOString(),
    });

    beforeEach(() => {
      jest.spyOn(repository, 'find').mockResolvedValue([mockSamlConfig]);
    });

    it('should create new SAML user when user does not exist', async () => {
      const mockSamlProfile = createMockSamlProfile();
      const newUser: User = {
        id: 'new-user-id',
        email: 'user@example.com',
        passwordHash: '',
        authProvider: 'saml',
        organizationId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        refreshTokens: [],
      };

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(userRepository, 'create').mockReturnValue(newUser as any);
      jest.spyOn(userRepository, 'save').mockResolvedValue(newUser);

      const result = await service.handleSamlLogin(mockSamlProfile);

      expect(result).toEqual(newUser);
      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'user@example.com',
          passwordHash: '',
          authProvider: 'saml',
        }),
      );
      expect(userRepository.save).toHaveBeenCalled();
    });

    it('should authenticate existing SAML user', async () => {
      const mockSamlProfile = createMockSamlProfile();
      const existingUser: User = {
        id: 'existing-user-id',
        email: 'user@example.com',
        passwordHash: '',
        authProvider: 'saml',
        organizationId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        refreshTokens: [],
      };

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(existingUser);

      const result = await service.handleSamlLogin(mockSamlProfile);

      expect(result).toEqual(existingUser);
      expect(userRepository.create).not.toHaveBeenCalled();
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('should reject local user with same email', async () => {
      const localUser: User = {
        id: 'local-user-id',
        email: 'user@example.com',
        passwordHash: 'hashed-password',
        authProvider: 'local',
        organizationId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        refreshTokens: [],
      };

      const profileForLocalUser = {
        nameID: 'user@example.com',
        email: 'user@example.com',
        ID: `unique-assertion-local-user-${Date.now()}-${testCounter++}`,
        notOnOrAfter: new Date(Date.now() + 300000).toISOString(),
      };

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(localUser);

      await expect(
        service.handleSamlLogin(profileForLocalUser),
      ).rejects.toThrow(
        'An account with this email already exists using password authentication',
      );
    });

    // TODO: Move this Redis test to e2e test suite
    it.skip('should reject replayed assertions', async () => {
      const assertionId = `replayed-assertion-${Date.now()}-${testCounter++}`;
      const profile = createMockSamlProfile();
      profile.ID = assertionId;

      // Mark assertion as processed
      await service.markAssertionProcessed(
        assertionId,
        new Date(Date.now() + 300000),
      );

      await expect(service.handleSamlLogin(profile)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(service.handleSamlLogin(profile)).rejects.toThrow(
        'Assertion has already been processed',
      );
    });

    it('should throw error when no email is provided', async () => {
      const profileWithoutEmail = {
        ID: `assertion-no-email-${Date.now()}-${testCounter++}`,
      };

      await expect(
        service.handleSamlLogin(profileWithoutEmail),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        service.handleSamlLogin(profileWithoutEmail),
      ).rejects.toThrow('No email address provided in assertion');
    });

    it('should normalize email to lowercase', async () => {
      const profileWithUppercaseEmail = {
        nameID: 'User@Example.COM',
        ID: `assertion-uppercase-${Date.now()}-${testCounter++}`,
        notOnOrAfter: new Date(Date.now() + 300000).toISOString(),
      };

      const newUser: User = {
        id: 'new-user-id',
        email: 'user@example.com',
        passwordHash: '',
        authProvider: 'saml',
        organizationId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        refreshTokens: [],
      };

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(userRepository, 'create').mockReturnValue(newUser as any);
      jest.spyOn(userRepository, 'save').mockResolvedValue(newUser);

      await service.handleSamlLogin(profileWithUppercaseEmail);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
      });
      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'user@example.com',
        }),
      );
    });

    it('should use default expiration when notOnOrAfter is not provided', async () => {
      const profileWithoutExpiration = {
        nameID: 'user@example.com',
        ID: `assertion-no-expiry-${Date.now()}-${testCounter++}`,
      };

      const newUser: User = {
        id: 'new-user-id',
        email: 'user@example.com',
        passwordHash: '',
        authProvider: 'saml',
        organizationId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        refreshTokens: [],
      };

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(userRepository, 'create').mockReturnValue(newUser as any);
      jest.spyOn(userRepository, 'save').mockResolvedValue(newUser);

      const result = await service.handleSamlLogin(profileWithoutExpiration);

      expect(result).toEqual(newUser);
    });
  });

  describe('Password Login Control', () => {
    describe('setPasswordLoginDisabled', () => {
      it('should disable password login', async () => {
        const config = { ...mockSamlConfig, disablePasswordLogin: false };
        jest.spyOn(repository, 'find').mockResolvedValue([config]);
        jest.spyOn(repository, 'save').mockResolvedValue({
          ...config,
          disablePasswordLogin: true,
        });

        await service.setPasswordLoginDisabled(true);

        expect(repository.save).toHaveBeenCalledWith(
          expect.objectContaining({ disablePasswordLogin: true }),
        );
      });

      it('should enable password login', async () => {
        const config = { ...mockSamlConfig, disablePasswordLogin: true };
        jest.spyOn(repository, 'find').mockResolvedValue([config]);
        jest.spyOn(repository, 'save').mockResolvedValue({
          ...config,
          disablePasswordLogin: false,
        });

        await service.setPasswordLoginDisabled(false);

        expect(repository.save).toHaveBeenCalledWith(
          expect.objectContaining({ disablePasswordLogin: false }),
        );
      });

      it('should throw NotFoundException if config does not exist', async () => {
        jest.spyOn(repository, 'find').mockResolvedValue([]);

        await expect(service.setPasswordLoginDisabled(true)).rejects.toThrow(
          NotFoundException,
        );
      });
    });

    describe('isPasswordLoginAllowed', () => {
      it('should return true when password login is not disabled', async () => {
        const config = { ...mockSamlConfig, disablePasswordLogin: false };
        jest.spyOn(repository, 'find').mockResolvedValue([config]);
        jest.spyOn(configService, 'get').mockReturnValue('false'); // FORCE_ENABLE_PASSWORD_LOGIN

        const result = await service.isPasswordLoginAllowed();

        expect(result).toBe(true);
      });

      it('should return false when password login is disabled', async () => {
        const config = { ...mockSamlConfig, disablePasswordLogin: true };
        jest.spyOn(repository, 'find').mockResolvedValue([config]);
        jest.spyOn(configService, 'get').mockReturnValue('false'); // FORCE_ENABLE_PASSWORD_LOGIN

        const result = await service.isPasswordLoginAllowed();

        expect(result).toBe(false);
      });

      it('should return true when FORCE_ENABLE_PASSWORD_LOGIN is set', async () => {
        const config = { ...mockSamlConfig, disablePasswordLogin: true };
        jest.spyOn(repository, 'find').mockResolvedValue([config]);
        jest.spyOn(configService, 'get').mockReturnValue('true'); // FORCE_ENABLE_PASSWORD_LOGIN

        const result = await service.isPasswordLoginAllowed();

        expect(result).toBe(true);
      });

      it('should return true when no SAML config exists', async () => {
        jest.spyOn(repository, 'find').mockResolvedValue([]);
        jest.spyOn(configService, 'get').mockReturnValue('false'); // FORCE_ENABLE_PASSWORD_LOGIN

        const result = await service.isPasswordLoginAllowed();

        expect(result).toBe(true);
      });
    });
  });
});
