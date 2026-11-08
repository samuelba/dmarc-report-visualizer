import * as path from 'path';
import * as dotenv from 'dotenv';

export const IMAP_TEST_ENV_FILE = path.join(__dirname, 'imap-test.env');

/**
 * Loads test/imap/imap-test.env into process.env.
 * With `override`, the file wins over variables already set (used by the e2e
 * test so a developer's backend/.env or shell cannot leak into it).
 */
export function loadImapTestEnv(options: { override: boolean }): void {
  const result = dotenv.config({
    path: IMAP_TEST_ENV_FILE,
    override: options.override,
    quiet: true,
  });
  if (result.error) {
    throw result.error;
  }
}
