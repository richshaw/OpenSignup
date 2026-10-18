import { fail } from '@/lib/api-response';
import { organizerRoute } from '@/lib/organizer-route';
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

export const GET = organizerRoute<{ id: string }>(async ({ db, actor, params: { id } }) => {
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
