/**
 * Creates the uuid_generate_v7() Postgres function used as the default for
 * every UUID primary key. Idempotent (CREATE OR REPLACE).
 *
 * Shared because AddUuidV7174090000000 has a 12-digit class-name suffix, which
 * TypeORM parses as timestamp 7174090000000: on a fresh database it runs AFTER
 * every other migration. Any migration that creates a table defaulting to
 * uuid_generate_v7() must therefore run this SQL itself first.
 */
export const UUID_GENERATE_V7_FUNCTION_SQL = `
      CREATE OR REPLACE FUNCTION uuid_generate_v7()
      RETURNS uuid
      AS $$
      DECLARE
        unix_ts_ms bytea;
        uuid_bytes bytea;
      BEGIN
        unix_ts_ms = substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3);

        -- use random v4 uuid as starting point (which has the version bits, so we need to override them)
        uuid_bytes = uuid_send(gen_random_uuid());

        -- overlay timestamp
        uuid_bytes = overlay(uuid_bytes placing unix_ts_ms from 1 for 6);

        -- set version 7 (0111)
        uuid_bytes = set_byte(uuid_bytes, 6, (get_byte(uuid_bytes, 6) & x'0f'::int) | x'70'::int);

        return encode(uuid_bytes, 'hex')::uuid;
      END
      $$
      LANGUAGE plpgsql
      VOLATILE;
    `;
