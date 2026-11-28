import { localeOfOrganizer } from '@/i18n/locale';
import { getServerTranslator } from '@/i18n/server';
import { fail } from '@/lib/api-response';
import { organizerRoute } from '@/lib/organizer-route';
import { attachmentNamed, csvSeparator, responsesCsv } from '@/lib/responses-csv';
import { howCommitmentsEnded, listCommitmentsForSignup } from '@/services/commitments';
import { getSignupRowForOrganizer } from '@/services/locks';
import { listFieldsForSignup } from '@/services/slot-fields';
import { listSlotsForSignup } from '@/services/slots';

export const GET = organizerRoute<{ id: string }>(
  async ({ db, actor, session, params: { id } }) => {
    const loaded = await getSignupRowForOrganizer(db, actor, id);
    if (!loaded.ok) return fail(loaded.error);
    const row = loaded.value;

    // The file's own words (its column names and statuses) are in the
    // organizer's language: the one stored on their account, never the
    // request's. It's on the session, not on `Actor`, so a cookie and a token
    // still give the same actor.
    const [fields, slots, commitments, ended] = await Promise.all([
      listFieldsForSignup(db, id),
      listSlotsForSignup(db, id),
      listCommitmentsForSignup(db, id),
      howCommitmentsEnded(db, row),
    ]);
    // The separator follows that language too, as a spreadsheet there expects.
    const locale = localeOfOrganizer(session);
    const t = getServerTranslator(locale, 'organizer.responses');
    const csv = responsesCsv({ fields, slots, commitments, ended }, t, csvSeparator(locale));
    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': attachmentNamed(t('csv.fileName', { slug: row.slug })),
      },
    });
  },
);
