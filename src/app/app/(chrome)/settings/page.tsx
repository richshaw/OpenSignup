import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  getOrganizerSession,
  requireOrganizerSession,
  toActor,
  type OrganizerSession,
} from '@/auth/session';
import { FormError } from '@/components/ui/form-error';
import { SavedNotice } from '@/components/ui/save-notice';
import { getDb } from '@/db/client';
import { type CatalogLocale, SHIPPED, languageName, languageNameInSentence } from '@/i18n/config';
import { localeOfOrganizer, newSignupLocale } from '@/i18n/locale';
import { getServerTranslator } from '@/i18n/server';
import type { Translator } from '@/i18n/translator';
import { refusalAsResult } from '@/lib/errors';
import { refusalFromQuery } from '@/lib/organizer-errors';
import { openSignupsToSwitch } from '@/services/signups';
import { setOrganizerLocaleAction, switchOpenSignupsLocaleAction } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const locale = localeOfOrganizer(await getOrganizerSession());
  return { title: getServerTranslator(locale, 'organizer.settings')('title') };
}
export const dynamic = 'force-dynamic';

/** The arrow at the end of each section's card: a mark, the same in every language. */
const ARROW = '→';

/**
 * The settings hub the account link in the header opens. One section today;
 * the list is the place the next ones (profile, workspaces, notifications)
 * go, so each is a card with a name and a one-line description rather than
 * a bare link.
 */
function sections(t: Translator<'organizer.settings'>) {
  return [
    {
      href: '/app/settings/connected-apps',
      title: t('connectedApps.title'),
      description: t('connectedApps.description'),
    },
  ];
}

type PageProps = {
  searchParams: Promise<{ error?: string; saved?: string; switched?: string }>;
};

export default async function SettingsPage({ searchParams }: PageProps) {
  const { error, saved, switched } = await searchParams;
  const session = await requireOrganizerSession();
  const openSignups = await openSignupsInAnotherLanguage(session);
  const t = getServerTranslator(localeOfOrganizer(session), 'organizer.settings');

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-ink-muted">
          {t.rich('signedInAs', {
            email: session.email,
            account: (chunks) => <span className="font-medium text-ink">{chunks}</span>,
          })}
        </p>
      </div>
      <ul className="divide-y divide-surface-sunk rounded-xl border border-surface-sunk bg-white">
        {sections(t).map((s) => (
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
                {ARROW}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <OrganizerLanguageForm
        t={t}
        session={session}
        error={error}
        saved={saved === 'language'}
        openSignups={openSignups}
        switched={switched === '1'}
      />
    </section>
  );
}

/** How many open signups an organizer has, and how many of those are in another language. */
interface OpenSignupCounts {
  open: number;
  toSwitch: number;
}

/**
 * The organizer's open signups (`openSignupsToSwitch` says which count): how
 * many there are, and how many aren't in their language for new signups,
 * which the button "Switch them to Svenska" offers to change. One
 * statement on each visit once a second language has shipped to participants;
 * until then none, and no statement.
 */
async function openSignupsInAnotherLanguage(session: OrganizerSession): Promise<OpenSignupCounts> {
  const mine = newSignupLocale(session);
  if (!mine) return { open: 0, toSwitch: 0 };
  const read = await refusalAsResult(() =>
    openSignupsToSwitch(getDb(), toActor(session), mine.locale),
  );
  return read.ok
    ? { open: read.value.open, toSwitch: read.value.toSwitch.length }
    : { open: 0, toSwitch: 0 };
}

/**
 * "Language": the language of the organizer's own screens
 * (`localeOfOrganizer`), and the one each signup they make starts in
 * (`newSignupLocale`). A language ships to organizers and to participants in
 * the same release, so the choices are the participants' list. With one
 * language shipped there's nothing to choose, so it renders nothing until a
 * second one ships. Like the Settings tab's "Signup language", a plain form
 * with each language named in itself (English, Svenska), so the organizer
 * finds theirs whatever language the rest of the page is in. Its Save is a
 * plain button, as Sign out is, so the page loads no script of its own.
 *
 * Under it, while some of the organizer's open signups are in another
 * language, how many, a button that switches them to this one (#639), and
 * what switching changes and what it leaves (#933's tophat: the signups' own
 * words stay as typed, and people already signed up see the new language).
 * Once it has, how many of their open signups use it now, in the button's
 * place. All plain HTML too: nothing appears after the language's own Save,
 * and nothing moves or takes the focus. The button is gone once they're
 * switched, so a second tap finds nothing to press. The words say "1 of your
 * signups is open", never "your open signup", which read as the product's
 * name.
 */
function OrganizerLanguageForm({
  t,
  session,
  error,
  saved,
  openSignups,
  switched,
}: {
  /** The page's text, in the organizer app's language. */
  t: Translator<'organizer.settings'>;
  session: OrganizerSession;
  /** The `error` the action came back with: a refusal's code. */
  error: string | undefined;
  /** Whether this form just saved. */
  saved: boolean;
  /** How many open signups the organizer has, and how many are in another language. */
  openSignups: OpenSignupCounts;
  /** Whether the switch just ran: the address's `switched=1`, a flag. */
  switched: boolean;
}) {
  const languages: readonly CatalogLocale[] = SHIPPED.participant;
  // The language new signups get now: the one stored on the account, or with
  // none stored (or one that has left the list) the instance's, else English.
  // So the choice shown is always one that saves. None while there's only
  // one language to choose.
  const mine = newSignupLocale(session);
  if (!mine) return null;
  const current = mine.locale;
  // Only a code the action sends shows, in the words the Settings tab uses,
  // so a link can't put its own words on the page.
  const pageLocale = localeOfOrganizer(session);
  const refusal = refusalFromQuery(getServerTranslator(pageLocale, 'organizer.errors'), error);
  // Named in itself, as in the list above, but cased as the page's language
  // writes a language's name in a sentence: "to Svenska", "till svenska".
  const name = languageNameInSentence(current, pageLocale);
  const language = (chunks: ReactNode) => <span lang={current}>{chunks}</span>;

  return (
    <div className="space-y-4 rounded-xl border border-surface-sunk bg-white px-5 py-4">
      {refusal ? <FormError>{refusal}</FormError> : null}
      {/* Keyed on the choice shown, so after a save it's the saved one. */}
      <form key={current} action={setOrganizerLocaleAction} className="flex flex-col gap-4">
        <fieldset>
          <legend className="font-medium">{t('language.legend')}</legend>
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
            {t('language.help')}
          </p>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-hover"
          >
            {t('language.save')}
          </button>
          {saved ? <SavedNotice role="status">{t('language.saved')}</SavedNotice> : null}
        </div>
      </form>
      {openSignups.toSwitch > 0 ? (
        <div className="space-y-3 border-t border-surface-sunk pt-4">
          <p id="switch-open-signups-why" className="text-sm">
            {t.rich('language.toSwitch', { count: openSignups.toSwitch, name, language })}
          </p>
          <form action={switchOpenSignupsLocaleAction}>
            {/* Outlined in the brand's blue, so it reads as a button on the
                white card; the darker blue for its words keeps 4.5:1 on
                white and on the hover's tint. "Switch it" names nothing on
                its own, so it's described by the lines around it. */}
            <button
              type="submit"
              aria-describedby="switch-open-signups-why switch-open-signups-note"
              className="rounded-lg border border-brand bg-white px-4 py-2 text-sm font-medium text-brand-hover transition hover:bg-brand-soft"
            >
              {t.rich('language.switch', { count: openSignups.toSwitch, name, language })}
            </button>
          </form>
          <p id="switch-open-signups-note" className="text-sm text-ink-muted">
            {t('language.switchNote')}
          </p>
        </div>
      ) : switched && openSignups.open > 0 ? (
        // Once none is left in another language, with the count from what's
        // stored: the address says only that the switch ran.
        <div className="border-t border-surface-sunk pt-4">
          <SavedNotice role="status">
            {t.rich('language.switched', { count: openSignups.open, name, language })}
          </SavedNotice>
        </div>
      ) : null}
    </div>
  );
}
