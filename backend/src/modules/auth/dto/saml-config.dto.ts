import { IsOptional, IsString, IsUrl } from 'class-validator';

/**
 * DTO for SAML configuration
 * Supports both metadata XML upload and manual field entry
 */
export class SamlConfigDto {
  @IsOptional()
  @IsString()
  idpMetadataXml?: string;

  @IsOptional()
  @IsString()
  idpEntityId?: string;

  @IsOptional()
  @IsUrl({}, { message: 'IdP SSO URL must be a valid URL' })
  idpSsoUrl?: string;

  @IsOptional()
  @IsString()
  idpCertificate?: string;
}

/**
 * Response interface for SAML configuration
 * Returns configuration status and SP details
 */
export interface SamlConfigResponse {
  enabled: boolean;
  configured: boolean;
  spEntityId: string;
  spAcsUrl: string;
  idpEntityId?: string;
  idpSsoUrl?: string;
  hasIdpCertificate: boolean;
}
