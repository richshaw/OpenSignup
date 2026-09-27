import type { NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { requireActor } from '@/auth/session';
import { fail, handle } from '@/lib/api-response';
import { serviceError } from '@/lib/errors';
import { listCommitmentsForSignup } from '@/services/commitments';
import { getSignupRowForOrganizer } from '@/services/signups';
import { listSlotsForSignup } from '@/services/slots';

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
    const loaded = await getSignupRowForOrganizer(db, actor, id);
    if (!loaded.ok) return fail(loaded.error);
    const row = loaded.value;

    const [slotRows, commitments] = await Promise.all([
      listSlotsForSignup(db, id),
      listCommitmentsForSignup(db, id),
    ]);
    const slotsById = new Map(slotRows.map((s) => [s.id, s]));

    const header = [
      'slot_ref',
      'slot_values',
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
          slot?.ref ?? '',
          slot ? JSON.stringify(slot.values) : '',
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
