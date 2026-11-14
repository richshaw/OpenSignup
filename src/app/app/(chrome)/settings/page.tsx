import Link from 'next/link';
import { requireOrganizerSession, toActor, type OrganizerSession } from '@/auth/session';
import { FormError } from '@/components/ui/form-error';
import { SAVE_ERROR_MESSAGE, SavedNotice } from '@/components/ui/save-notice';
import { getDb } from '@/db/client';
import { type CatalogLocale, SHIPPED, languageName } from '@/i18n/config';
import { getOrganizerLocale } from '@/i18n/organizer';
import { type ErrorCode, refusalAsResult } from '@/lib/errors';
import { openSignupsToSwitch } from '@/services/signups';
import { setOrganizerLocaleAction, switchOpenSignupsLocaleAction } from './actions';

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

type PageProps = {
  searchParams: Promise<{ error?: string; saved?: string; switched?: string }>;
};

export default async function SettingsPage({ searchParams }: PageProps) {
  const { error, saved, switched } = await searchParams;
  const session = await requireOrganizerSession();
  const toSwitch = await openSignupsInAnotherLanguage(session);

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
        error={error}
        saved={saved === 'language'}
        toSwitch={toSwitch}
        switched={switchedCount(switched)}
      />
    </section>
  );
}

/**
 * How many of the organizer's open signups aren't in their language for new
 * signups, which "Switch your 3 open signups to Svenska" offers to change
 * (`openSignupsToSwitch` says which count). One statement on each visit once a
 * second language has shipped to participants; until then 0, without one.
 */
async function openSignupsInAnotherLanguage(session: OrganizerSession): Promise<number> {
  if (SHIPPED.participant.length < 2) return 0;
  const { locale } = getOrganizerLocale(session, 'participant');
  const ids = await refusalAsResult(() => openSignupsToSwitch(getDb(), toActor(session), locale));
  return ids.ok ? ids.value.length : 0;
}

/**
 * How many signups the switch changed, from its `switched=`: a whole number
 * from 1 to 9999, else none, so a link can put only a count on the page.
 */
function switchedCount(switched: string | undefined): number | null {
  return switched && /^[1-9]\d{0,3}$/.test(switched) ? Number(switched) : null;
}

/**
 * "Language for new signups": the language each signup the organizer makes
 * starts in. With one language shipped to participants there's nothing to
 * choose, so it renders nothing until a second one ships. Like the Settings
 * tab's "Signup language", a plain form with each language named in itself
 * (English, Svenska), so the organizer finds theirs whatever language the
 * rest of the page is in. Its Save is a plain button, as Sign out is, so the
 * page loads no script of its own.
 *
 * Under it, while some of the organizer's open signups are in another
 * language, a button that switches them to this one (#639), and once it has,
 * what it did, in the place of "Saved". Both are plain HTML too: nothing
 * appears after the language's own Save, and nothing moves or takes the
 * focus. The button is gone once they're switched, so a second tap finds
 * nothing to press.
 */
function OrganizerLanguageForm({
  session,
  error,
  saved,
  toSwitch,
  switched,
}: {
  session: OrganizerSession;
  /** The `error` the action came back with: a refusal's code. */
  error: string | undefined;
  /** Whether this form just saved. */
  saved: boolean;
  /** How many of the organizer's open signups are in another language. */
  toSwitch: number;
  /** How many the switch just changed, from the address. */
  switched: number | null;
}) {
  const languages: readonly CatalogLocale[] = SHIPPED.participant;
  if (languages.length < 2) return null;
  // The language new signups get now: the one stored on the account, or with
  // none stored (or one that has left the list) the instance's, else English.
  // So the choice shown is always one that saves.
  const { locale: current } = getOrganizerLocale(session, 'participant');
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
        <fieldset>
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
      {toSwitch > 0 ? (
        <form action={switchOpenSignupsLocaleAction} className="border-t border-surface-sunk pt-4">
          <button
            type="submit"
            className="rounded-lg border border-surface-sunk bg-white px-4 py-2 text-sm font-medium transition hover:bg-surface-raised"
          >
            Switch your {toSwitch} open {toSwitch === 1 ? 'signup' : 'signups'} to {name}
          </button>
        </form>
      ) : switched !== null ? (
        // Only once none is left in another language; all the address can
        // add is a count.
        <div className="border-t border-surface-sunk pt-4">
          <SavedNotice role="status">
            Saved. {switched} {switched === 1 ? 'signup now uses' : 'signups now use'} {name}.
          </SavedNotice>
        </div>
      ) : null}
    </div>
  );
}
