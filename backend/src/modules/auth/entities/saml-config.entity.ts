import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('saml_configs')
export class SamlConfig {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuid_generate_v7()' })
  id: string;

  @Column({ default: true })
  enabled: boolean;

  // IdP Configuration
  @Column({
    name: 'idp_entity_id',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  idpEntityId: string | null;

  @Column({ name: 'idp_sso_url', type: 'varchar', length: 500, nullable: true })
  idpSsoUrl: string | null;

  @Column({ name: 'idp_certificate', type: 'text', nullable: true })
  idpCertificate: string | null;

  // SP Configuration
  @Column({ name: 'sp_entity_id', type: 'varchar', length: 255 })
  spEntityId: string;

  @Column({ name: 'sp_acs_url', type: 'varchar', length: 500 })
  spAcsUrl: string;

  // Metadata
  @Column({ name: 'idp_metadata_xml', type: 'text', nullable: true })
  idpMetadataXml: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @Column({ name: 'disable_password_login', type: 'boolean', default: false })
  disablePasswordLogin: boolean;
}
