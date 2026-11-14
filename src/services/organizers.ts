import { eq } from 'drizzle-orm';
import type { Db, Queryable } from '@/db/client';
import { organizers } from '@/db/schema/organizers';
import { type CatalogLocale, SHIPPED, isShipped } from '@/i18n/config';
import { activityActor, recordActivity } from '@/lib/activity';
import { serviceError, type ServiceError } from '@/lib/errors';
import { requireOrganizerId, type Actor } from '@/lib/policy';
import { err, ok, type Result } from '@/lib/result';

/**
 * Saves the language an organizer chose for their new signups (#626). It's
 * the acting organizer's own, so there's no id to pass and no way to change
 * anyone else's; anyone who isn't an organizer is refused by the policy guard.
 *
 * The language must have shipped to participants, since a signup's pages and
 * emails follow it. Anything else, an empty value included, is refused with
 * `invalid_input` and leaves the stored language as it was. There is no
 * clearing it: every choice offered is a language, and one that later stops
 * shipping is passed over where it's read (`chooseOrganizerLocale`).
 */
export async function updateOrganizerLocale(
  db: Queryable,
  actor: Actor,
  locale: unknown,
): Promise<Result<{ locale: CatalogLocale }, ServiceError>> {
  const organizerId = requireOrganizerId(actor);
  if (!isShipped('participant', locale)) {
    return err(
      serviceError('invalid_input', 'locale must be a language OpenSignup offers for signups', {
        field: 'locale',
        received: locale,
        suggestion: `use one of: ${SHIPPED.participant.join(', ')}`,
      }),
    );
  }
  const updated = await db
    .update(organizers)
    .set({ locale })
    .where(eq(organizers.id, organizerId))
    .returning({ id: organizers.id });
  if (updated.length === 0) return err(serviceError('not_found', 'organizer not found'));
  return ok({ locale });
}

/**
 * An answer to the notice on Your signups that offers an organizer a language
 * (#640): saves `locale` as their language for new signups, as
 * `updateOrganizerLocale` does and with the same refusals, and records which
 * answer it was (`language_notice.answered`) in the same transaction. Both of
 * the notice's buttons come here, "Use Swedish" with `sv` and "Keep English"
 * with `en`, so either answer saves a language and the notice, which shows
 * only while none is saved, is gone for good.
 */
export async function answerLanguageNotice(
  db: Db,
  actor: Actor,
  locale: unknown,
): Promise<Result<{ locale: CatalogLocale }, ServiceError>> {
  const who = activityActor(actor);
  return db.transaction(async (tx) => {
    const saved = await updateOrganizerLocale(tx, actor, locale);
    if (saved.ok) {
      await recordActivity(tx, {
        actor: who,
        eventType: 'language_notice.answered',
        payload: { locale: saved.value.locale },
      });
    }
    return saved;
  });
}
