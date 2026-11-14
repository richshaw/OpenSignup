import type { OrganizerSession } from '@/auth/session';
import { Banner } from '@/components/banner';
import { getDb } from '@/db/client';
import { isShipped } from '@/i18n/config';
import { getOrganizerLocale } from '@/i18n/organizer';
import { getServerTranslator, instanceDefaultLocale } from '@/i18n/server';
import { descriptionsLookWrittenIn, signupsLookWrittenIn } from '@/i18n/written-in';
import type { Actor } from '@/lib/policy';
import { listDescriptionStarts, type SignupSummary } from '@/services/signups';
import { answerSwedishNoticeAction } from './actions';

/**
 * Why Your signups offers Swedish: the browser asks for it first, or the
 * signups' titles, or else the start of their descriptions, look Swedish.
 */
type SwedishNoticeReason = 'browser' | 'titles' | 'descriptions';

/**
 * Whether Your signups shows the notice that offers Swedish (#640), and why,
 * or null. It's for organizers who probably want Swedish but haven't chosen a
 * language, so it shows only while all of these hold:
 *
 * - Swedish has shipped to participants, so there's something to switch to;
 * - the organizer has saved no language (either button saves one, so an
 *   answer takes the notice away for good);
 * - the instance has no `DEFAULT_LOCALE`, which organizers and signups with no
 *   language of their own already follow;
 * - their browser asks for Swedish first, or their signups look Swedish.
 *
 * Swedish only, not any language with a `WRITING` entry: the notice is for
 * Swedish's launch, its title names Swedish and its second line is Swedish,
 * and the next language would need words of its own.
 *
 * The browser and the titles cost nothing: the request has the one, and the
 * page has already loaded the other (`rows`). When neither settles it, one
 * statement reads the start of the workspace's newest descriptions
 * (`listDescriptionStarts`), which can only add evidence. Nothing is read
 * while Swedish hasn't shipped, or for an organizer who has chosen.
 */
export async function swedishNoticeReason({
  session,
  actor,
  workspaceId,
  acceptLanguage,
  rows,
}: {
  session: Pick<OrganizerSession, 'locale'>;
  actor: Actor;
  workspaceId: string;
  /** The request's `Accept-Language` header, if it has one. */
  acceptLanguage: string | null;
  /** The signups Your signups lists. */
  rows: readonly SignupSummary[];
}): Promise<SwedishNoticeReason | null> {
  if (!isShipped('participant', 'sv') || session.locale || instanceDefaultLocale()) return null;
  // With nothing saved and no instance language, only the browser can choose.
  if (getOrganizerLocale(session, acceptLanguage, 'participant').locale === 'sv') return 'browser';
  if (signupsLookWrittenIn('sv', rows)) return 'titles';
  if (rows.length === 0) return null;
  const descriptions = await listDescriptionStarts(getDb(), actor, workspaceId);
  return descriptions.ok && descriptionsLookWrittenIn('sv', descriptions.value)
    ? 'descriptions'
    : null;
}

/**
 * "Your signups can be in Swedish now.", with its twin in Swedish right under
 * it, as the title's second line, for the people it's for; then two buttons
 * that each save a language (`answerSwedishNoticeAction`), so it needs no
 * dismissal of its own. The organizer app is English, so the rest is too. The
 * title and its Swedish come from one catalog key, so a change to the English
 * marks the Swedish stale. Plain forms, so the page loads no script for it.
 */
export function SwedishNotice() {
  const english = getServerTranslator('en', 'organizer.swedishNotice');
  const swedish = getServerTranslator('sv', 'organizer.swedishNotice');
  return (
    <Banner
      kind="offer"
      // Part of the page from the start, so nothing to announce.
      live={false}
      title={
        <>
          {english('title')}{' '}
          <span lang="sv" className="block">
            {swedish('title')}
          </span>
        </>
      }
      body="Choose the language your new signups start in: the buttons, messages and dates people see, and the emails they get. You can change it later in your account’s Settings."
    >
      <div className="flex flex-wrap items-center gap-2 pt-2 text-sm">
        <form action={answerSwedishNoticeAction}>
          <input type="hidden" name="locale" value="sv" />
          <button
            type="submit"
            className="rounded-lg border border-brand bg-brand px-3 py-1.5 font-medium text-white transition hover:bg-brand-hover"
          >
            Use Swedish
          </button>
        </form>
        <form action={answerSwedishNoticeAction}>
          <input type="hidden" name="locale" value="en" />
          <button
            type="submit"
            className="rounded-lg border border-surface-sunk bg-white px-3 py-1.5 font-medium text-ink transition hover:bg-surface-raised"
          >
            Keep English
          </button>
        </form>
      </div>
    </Banner>
  );
}
