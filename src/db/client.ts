import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getEnv } from '@/lib/env';
import * as schema from './schema';

declare global {
  var __signup_pg__: ReturnType<typeof postgres> | undefined;
}

/**
 * Settings every connection the app opens starts with. Postgres prints a
 * timestamptz in the session's time zone, and the driver hands that text to
 * `new Date()`, which cannot read an offset with seconds in it. Many zones had
 * one before they took up standard time (Amsterdam's +00:19:32 until 1937), so
 * on a database whose default zone is one of them a slot dated 1920 read back
 * as an Invalid Date. Sent at connection start, this outranks the server's,
 * database's and role's defaults; a `SET` in the session still overrides it.
 */
export const SESSION_SETTINGS = { TimeZone: 'UTC' };

function getClient() {
  if (!globalThis.__signup_pg__) {
    const env = getEnv();
    globalThis.__signup_pg__ = postgres(env.DATABASE_URL, {
      max: env.NODE_ENV === 'test' ? 4 : 10,
      idle_timeout: 20,
      prepare: false,
      connection: SESSION_SETTINGS,
    });
  }
  return globalThis.__signup_pg__;
}

export function getDb() {
  return drizzle(getClient(), { schema, casing: 'snake_case' });
}

export type Db = ReturnType<typeof getDb>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** DB-or-transaction handle, for helpers that can be called in either context. */
export type Queryable = Db | Tx;
