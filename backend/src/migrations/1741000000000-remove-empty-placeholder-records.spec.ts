import {
  EMPTY_PLACEHOLDER_RECORD_SQL,
  RemoveEmptyPlaceholderRecords1741000000000,
} from './1741000000000-remove-empty-placeholder-records';
import { affectedRowCount } from './utils/affected-row-count';
import * as placeholderMigration from './1741000000000-remove-empty-placeholder-records';

describe('RemoveEmptyPlaceholderRecords1741000000000', () => {
  describe('TypeORM export contract', () => {
    it('only exports functions whose names end with a 13-digit timestamp', () => {
      for (const [name, value] of Object.entries(placeholderMigration)) {
        if (typeof value === 'function') {
          expect(name).toMatch(/\d{13}$/);
        }
      }
    });
  });

  describe('EMPTY_PLACEHOLDER_RECORD_SQL', () => {
    it('treats empty-string envelope and reason columns as empty', () => {
      expect(EMPTY_PLACEHOLDER_RECORD_SQL).toContain(
        `("envelopeTo" IS NULL OR "envelopeTo" = '')`,
      );
      expect(EMPTY_PLACEHOLDER_RECORD_SQL).toContain(
        `("envelopeFrom" IS NULL OR "envelopeFrom" = '')`,
      );
      expect(EMPTY_PLACEHOLDER_RECORD_SQL).toContain(
        `("reasonType" IS NULL OR "reasonType" = '')`,
      );
      expect(EMPTY_PLACEHOLDER_RECORD_SQL).toContain(
        `("reasonComment" IS NULL OR "reasonComment" = '')`,
      );
    });

    it('ignores all-empty policy override reason rows', () => {
      expect(EMPTY_PLACEHOLDER_RECORD_SQL).toContain(
        `((por.type IS NOT NULL AND por.type != '') OR (por.comment IS NOT NULL AND por.comment != ''))`,
      );
    });
  });

  describe('affectedRowCount', () => {
    it('reads rowCount from a PostgreSQL result object', () => {
      expect(affectedRowCount({ rowCount: 12 })).toBe(12);
    });

    it('reads affected from a TypeORM structured result', () => {
      expect(affectedRowCount({ affected: 4 })).toBe(4);
    });

    it('reads the second tuple element used by some drivers', () => {
      expect(affectedRowCount([[], 7])).toBe(7);
    });

    it('returns 0 for unexpected result shapes', () => {
      expect(affectedRowCount(undefined)).toBe(0);
      expect(affectedRowCount([])).toBe(0);
      expect(affectedRowCount({})).toBe(0);
    });
  });

  describe('down', () => {
    it('throws so revert cannot silently succeed', async () => {
      const migration = new RemoveEmptyPlaceholderRecords1741000000000();

      await expect(migration.down({} as never)).rejects.toThrow(
        /irreversible.*original XML/i,
      );
    });
  });
});
