import type { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { signups } from '@/db/schema/signups';
import { slots } from '@/db/schema/slots';
import { requireActor } from '@/auth/session';
import { fail, handle } from '@/lib/api-response';
import { serviceError } from '@/lib/errors';
import { requireWorkspaceAccess } from '@/lib/policy';
import { listCommitmentsForSignup } from '@/services/commitments';

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  // Defuse spreadsheet-formula injection: prefix any leading =, +, -, @, tab, or CR with a single quote.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await ctx.params;
    const actor = await requireActor();
    if (actor.kind !== 'organizer') return fail(serviceError('unauthorized', 'sign in required'));

    const db = getDb();
    const found = await db.select().from(signups).where(eq(signups.id, id)).limit(1);
    const row = found[0];
    if (!row) return fail(serviceError('not_found', 'signup not found'));
    requireWorkspaceAccess(actor, row.workspaceId);

    const slotRows = await db.select().from(slots).where(eq(slots.signupId, id));
    const slotsById = new Map(slotRows.map((s) => [s.id, s]));
    const commitments = await listCommitmentsForSignup(db, id);

    const header = [
      'slot_title',
      'slot_at',
      'participant_name',
      'participant_email',
      'status',
      'quantity',
      'notes',
      'created_at',
    ];
    const lines = [header.join(',')];
    for (const c of commitments) {
      const slot = slotsById.get(c.slotId);
      lines.push(
        [
          slot?.title ?? '',
          slot?.slotAt?.toISOString() ?? '',
          c.participantName,
          c.participantEmail,
          c.status,
          c.quantity,
          c.notes ?? '',
          c.createdAt.toISOString(),
        ]
          .map(csvEscape)
          .join(','),
      );
    }
    const csv = lines.join('\n');
    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${row.slug}-commitments.csv"`,
      },
    });
  });
}
