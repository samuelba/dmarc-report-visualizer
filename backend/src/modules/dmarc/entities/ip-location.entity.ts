import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Index('idx_ip_locations_ip', ['ip'], { unique: true })
@Index('idx_ip_locations_country', ['country'])
@Entity('ip_locations')
export class IpLocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'inet', unique: true })
  ip: string;

  @Column({ type: 'varchar', length: 2, nullable: true })
  country: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  countryName: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  region: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  regionName: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string;

  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  latitude: number;

  @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  longitude: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  timezone: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  isp: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  @Index('idx_ip_locations_org')
  org: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
