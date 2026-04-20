import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getEnv } from '@/lib/env';
import * as schema from './schema';

declare global {
  // eslint-disable-next-line no-var
  var __signup_pg__: ReturnType<typeof postgres> | undefined;
}

function getClient() {
  if (!globalThis.__signup_pg__) {
    const env = getEnv();
    globalThis.__signup_pg__ = postgres(env.DATABASE_URL, {
      max: env.NODE_ENV === 'test' ? 4 : 10,
      idle_timeout: 20,
      prepare: false,
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
export { schema };
