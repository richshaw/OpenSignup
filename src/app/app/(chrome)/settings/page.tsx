import { headers } from 'next/headers';
import Link from 'next/link';
import { requireOrganizerSession, toActor, type OrganizerSession } from '@/auth/session';
import { FormError, SuccessNotice } from '@/components/ui/form-error';
import { SAVE_ERROR_MESSAGE, SavedNotice } from '@/components/ui/save-notice';
import { SaveQuestion } from '@/components/ui/save-question';
import { getDb } from '@/db/client';
import { type CatalogLocale, SHIPPED, languageName } from '@/i18n/config';
import { getOrganizerLocale } from '@/i18n/organizer';
import { type ErrorCode, refusalAsResult } from '@/lib/errors';
import { openSignupsToSwitch } from '@/services/signups';
import { setOpenSignupsLocaleAction, setOrganizerLocaleAction } from './actions';

export const metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

/**
 * The settings hub the account link in the header opens. One section today;
 * the list is the place the next ones (profile, workspaces, notifications)
 * go, so each is a card with a name and a one-line description rather than
 * a bare link.
 */
const SECTIONS = [
  {
    href: '/app/settings/connected-apps',
    title: 'Connected apps',
    description:
      'AI assistants and other apps you have allowed to use your account, and how to disconnect them.',
  },
] as const;

type PageProps = { searchParams: Promise<{ error?: string; saved?: string }> };

export default async function SettingsPage({ searchParams }: PageProps) {
  const { error, saved } = await searchParams;
  const session = await requireOrganizerSession();
  const acceptLanguage = (await headers()).get('accept-language');
  const openSignups = await openSignupsAfterSave(session, acceptLanguage, saved);

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-ink-muted">
          Signed in as <span className="font-medium text-ink">{session.email}</span>.
        </p>
      </div>
      <ul className="divide-y divide-surface-sunk rounded-xl border border-surface-sunk bg-white">
        {SECTIONS.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-raised"
            >
              <span className="space-y-1">
                <span className="block font-medium">{s.title}</span>
                <span className="block text-sm text-ink-muted">{s.description}</span>
              </span>
              <span aria-hidden="true" className="shrink-0 text-ink-soft">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <OrganizerLanguageForm
        session={session}
        acceptLanguage={acceptLanguage}
        error={error}
        saved={saved === 'language'}
        openSignups={openSignups}
      />
    </section>
  );
}

/**
 * What follows a save of "Language for new signups" about the organizer's
 * open signups, from what's stored: after the save (`saved=language`), ask
 * "Use Svenska for your open signups too?" when any of them would change;
 * after its Yes (`saved=open-signups`), say so once none would. Otherwise,
 * and while one language has shipped, nothing, without a query. The address
 * says only which save it was, so a link can't name a language or put words
 * of its own on the page, and what shows is only ever true.
 */
async function openSignupsAfterSave(
  session: OrganizerSession,
  acceptLanguage: string | null,
  saved: string | undefined,
): Promise<'ask' | 'switched' | null> {
  if (SHIPPED.participant.length < 2) return null;
  if (saved !== 'language' && saved !== 'open-signups') return null;
  const { locale } = getOrganizerLocale(session, acceptLanguage, 'participant');
  const others = await refusalAsResult(() =>
    openSignupsToSwitch(getDb(), toActor(session), locale),
  );
  if (!others.ok) return null;
  if (saved === 'language') return others.value.length > 0 ? 'ask' : null;
  return others.value.length === 0 ? 'switched' : null;
}

/**
 * "Language for new signups": the language each signup the organizer makes
 * starts in. With one language shipped to participants there's nothing to
 * choose, so it renders nothing until a second one ships. Like the Settings
 * tab's "Signup language", a plain form with each language named in itself
 * (English, Svenska), so the organizer finds theirs whatever language the
 * rest of the page is in. Its Save is a plain button, as Sign out is, so the
 * page loads no script of its own. After a save, it may offer to put the
 * organizer's open signups in the same language (#639, `openSignupsAfterSave`).
 */
/** The "Language for new signups" choices' id, which No after its question comes back to. */
const ORGANIZER_LANGUAGE_ID = 'organizer-language';

function OrganizerLanguageForm({
  session,
  acceptLanguage,
  error,
  saved,
  openSignups,
}: {
  session: OrganizerSession;
  /** The request's `Accept-Language` header, if it has one. */
  acceptLanguage: string | null;
  /** The `error` the action came back with: a refusal's code. */
  error: string | undefined;
  /** Whether this form just saved. */
  saved: boolean;
  /** What to say about the organizer's open signups (`openSignupsAfterSave`). */
  openSignups: 'ask' | 'switched' | null;
}) {
  const languages: readonly CatalogLocale[] = SHIPPED.participant;
  if (languages.length < 2) return null;
  // The language new signups get now: the saved one, or with none saved (or
  // one that has left the list) the instance's, the browser's or English. So
  // the choice shown is always one that saves.
  const { locale: current } = getOrganizerLocale(session, acceptLanguage, 'participant');
  // Only a code the action sends shows, in the words the Settings tab uses,
  // so a link can't put its own words on the page.
  const refusal =
    error && Object.hasOwn(SAVE_ERROR_MESSAGE, error)
      ? SAVE_ERROR_MESSAGE[error as ErrorCode]
      : null;
  const name = <span lang={current}>{languageName(current)}</span>;

  return (
    <div className="space-y-4 rounded-xl border border-surface-sunk bg-white px-5 py-4">
      {refusal ? <FormError>{refusal}</FormError> : null}
      {/* Keyed on the choice shown, so after a save it's the saved one. */}
      <form key={current} action={setOrganizerLocaleAction} className="flex flex-col gap-4">
        {/* No after its question comes back here, by the fragment on its
            address, and the browser focuses it, so the next Tab goes on from
            this form. */}
        <fieldset id={ORGANIZER_LANGUAGE_ID} tabIndex={-1}>
          <legend className="font-medium">Language for new signups</legend>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
            {languages.map((locale) => (
              <label key={locale} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="locale"
                  value={locale}
                  defaultChecked={locale === current}
                  aria-describedby="organizer-language-help"
                  className="h-4 w-4 accent-brand"
                />
                <span lang={locale}>{languageName(locale)}</span>
              </label>
            ))}
          </div>
          <p id="organizer-language-help" className="mt-2 text-sm text-ink-muted">
            Each signup you make starts in this language, for the buttons, messages and dates on its
            page and in its emails. To change one signup’s language, use its Settings tab.
          </p>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-hover"
          >
            Save
          </button>
          {saved ? <SavedNotice role="status" /> : null}
        </div>
      </form>
      {openSignups === 'ask' ? (
        <SaveQuestion
          id="open-signups-language-question"
          question={<>Use {name} for your open signups too?</>}
          action={setOpenSignupsLocaleAction}
          fields={{ locale: current }}
          noHref={`/app/settings#${ORGANIZER_LANGUAGE_ID}`}
        />
      ) : null}
      {openSignups === 'switched' ? (
        <SuccessNotice>Saved. Your open signups now use {name}.</SuccessNotice>
      ) : null}
    </div>
  );
}
