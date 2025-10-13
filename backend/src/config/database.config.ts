import { registerAs } from '@nestjs/config';
import * as path from 'path';

function toBool(val: string | undefined, fallback: boolean): boolean {
  if (val === undefined) {
    return fallback;
  }
  const s = val.toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

export default registerAs('database', () => ({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
  username: process.env.DATABASE_USERNAME || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'dmarc',
  entities: [path.join(process.cwd(), 'dist/**/*.entity.js')],
  migrations: [path.join(process.cwd(), 'dist/src/migrations/*.js')],
  synchronize: toBool(
    process.env.DB_SYNCHRONIZE,
    process.env.NODE_ENV !== 'production',
  ),
  // Run migrations automatically on startup (can be disabled with DB_MIGRATIONS_RUN=false)
  migrationsRun: toBool(process.env.DB_MIGRATIONS_RUN, true),
}));
