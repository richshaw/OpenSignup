import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const url =
  process.env.DATABASE_URL ?? 'postgres://signup:signup@localhost:5433/signup';

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
  casing: 'snake_case',
  strict: true,
  verbose: true,
});
