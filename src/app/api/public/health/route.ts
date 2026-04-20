import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return NextResponse.json({ ok: true, status: 'healthy' });
  } catch (err) {
    return NextResponse.json(
      { ok: false, status: 'db_unreachable', error: (err as Error).message },
      { status: 503 },
    );
  }
}
