import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as path from 'path';

const dataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  username: process.env.DATABASE_USERNAME || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'dmarc',
  entities: [path.join(__dirname, 'dist/**/*.entity.js')],
  migrations: [path.join(__dirname, 'dist/migrations/*.js')],
});

export default dataSource;
