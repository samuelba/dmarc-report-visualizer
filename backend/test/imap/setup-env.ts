/**
 * Jest setupFile for the IMAP e2e test (test/jest-imap-e2e.json).
 * Runs before any module is imported, so ConfigModule and the TypeORM config
 * see these values.
 */
import { loadImapTestEnv } from './env';

// The file wins over backend/.env and the shell: the test must be reproducible
loadImapTestEnv({ override: true });

// Own database (recreated by the test), so manual test data is never touched
process.env.DATABASE_NAME = 'dmarc_imap_e2e';

// The test triggers polls itself instead of waiting for the interval
process.env.ENABLE_IMAP_DOWNLOADER = 'false';

// A fresh GreenMail mailbox per run (auto-created; any password is accepted)
process.env.IMAP_TEST_RUN_ID = Date.now().toString(36);
process.env.IMAP_USER = `e2e-${process.env.IMAP_TEST_RUN_ID}@test.local`;
process.env.IMAP_PASSWORD = 'e2e';
