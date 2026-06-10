import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { NextResponse } from 'next/server';
import { log } from '@/lib/log';
import { getWorkerStatus } from '@/lib/worker-health';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  try {
    await db.execute(sql`select 1`);
  } catch (err) {
    // Generic body only: this endpoint is unauthenticated and raw driver
    // errors can leak hosts/credentials. Details go to the server log.
    log.error({ err }, 'health: database unreachable');
    return NextResponse.json({ ok: false, status: 'db_unreachable' }, { status: 503 });
  }
  // Informational only — a stale worker must not fail the HTTP check, or the
  // platform would restart the healthy web process to fix the worker.
  const worker = await getWorkerStatus(db);
  return NextResponse.json({ ok: true, status: 'healthy', worker });
}
