import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// Load env from .env.local first (Next.js convention), then .env as fallback.
config({ path: '.env.local' });
config({ path: '.env' });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, prepare: false });
  const db = drizzle(sql);

  console.log('Running migrations…');
  await migrate(db, { migrationsFolder: 'src/db/migrations' });
  console.log('Done.');

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
