import { z } from 'zod';

export const MAX_RANGE_DAYS = 366;
const DEFAULT_RANGE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** A problem with the caller's input; its message is safe to return. */
export class ToolInputError extends Error {}

export const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(253)
  .regex(/^[a-z0-9._-]+$/, 'Must be a domain name');

const dateInput = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);

export const rangeShape = {
  domain: domainSchema.optional().describe('Limit results to this domain'),
  from: dateInput
    .optional()
    .describe(
      'Start of the period, ISO 8601 date or datetime. Defaults to 30 days before `to`.',
    ),
  to: dateInput
    .optional()
    .describe(
      'End of the period, ISO 8601 date (inclusive) or datetime. Defaults to now.',
    ),
};

export const pageShape = {
  page: z.number().int().min(1).max(1000).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
};

export const limitSchema = z
  .number()
  .int()
  .min(1)
  .max(50)
  .default(10)
  .describe('Maximum number of rows');

export function resolveRange(
  input: { from?: string; to?: string },
  now: Date = new Date(),
): { from: Date; to: Date } {
  const to = input.to ? parseEnd(input.to) : now;
  const from = input.from
    ? new Date(input.from)
    : new Date(to.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);

  if (from.getTime() > to.getTime()) {
    throw new ToolInputError('`from` must be before `to`');
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
    throw new ToolInputError(
      `The date range can be at most ${MAX_RANGE_DAYS} days`,
    );
  }
  return { from, to };
}

function parseEnd(value: string): Date {
  const date = new Date(value);
  return DATE_ONLY.test(value) ? new Date(date.getTime() + DAY_MS - 1) : date;
}
