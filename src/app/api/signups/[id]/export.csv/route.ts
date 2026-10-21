import { fail } from '@/lib/api-response';
import { organizerRoute } from '@/lib/organizer-route';
import { responsesCsv } from '@/lib/responses-csv';
import { howCommitmentsEnded, listCommitmentsForSignup } from '@/services/commitments';
import { getSignupRowForOrganizer } from '@/services/locks';
import { listFieldsForSignup } from '@/services/slot-fields';
import { listSlotsForSignup } from '@/services/slots';

export const GET = organizerRoute<{ id: string }>(async ({ db, actor, params: { id } }) => {
  const loaded = await getSignupRowForOrganizer(db, actor, id);
  if (!loaded.ok) return fail(loaded.error);
  const row = loaded.value;

  const [fields, slots, commitments, ended] = await Promise.all([
    listFieldsForSignup(db, id),
    listSlotsForSignup(db, id),
    listCommitmentsForSignup(db, id),
    howCommitmentsEnded(db, row),
  ]);
  return new Response(responsesCsv({ fields, slots, commitments, ended }), {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${row.slug}-responses.csv"`,
    },
  });
});
