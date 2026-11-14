import { AsyncSubmitButton } from '@/components/ui/async-submit-button';
import { SavedNotice } from '@/components/ui/save-notice';
import { type CatalogLocale, SHIPPED, defaultFor, languageName } from '@/i18n/config';
import { instanceDefaultLocale } from '@/i18n/server';
import { setSignupLocaleAction } from '../actions';

/**
 * The Settings tab's "Signup language": the language the signup's page and
 * emails use. With one language shipped to participants there's nothing to
 * choose, so it renders nothing until a second one ships. A plain form like
 * "Ask for an email address", so it adds no script. Each language is named in
 * itself (English, Svenska), so the organizer finds theirs whatever language
 * the rest of the tab is in.
 */
export function SignupLanguageForm({
  signupId,
  stored,
  saved,
}: {
  signupId: string;
  /** The signup's `settings.locale` as stored, which may be anything. */
  stored: unknown;
  /** Whether this form just saved. */
  saved: boolean;
}) {
  const languages: readonly CatalogLocale[] = SHIPPED.participant;
  if (languages.length < 2) return null;
  // A signup with no language of its own is in the instance's. One whose
  // language has since left the list shows that too, so the choice shown is
  // always one that saves.
  const current =
    languages.find((locale) => locale === stored) ??
    defaultFor('participant', instanceDefaultLocale());

  return (
    <section
      aria-labelledby="signup-language-heading"
      className="space-y-3 rounded-xl border border-surface-sunk bg-white p-6"
    >
      <h2 id="signup-language-heading" className="text-sm font-semibold">
        Language
      </h2>
      {/* Keyed on the stored choice, so after a save the one shown is the saved one. */}
      <form
        key={current}
        action={setSignupLocaleAction.bind(null, signupId)}
        className="flex flex-col gap-4"
      >
        <fieldset>
          <legend className="text-sm font-medium">Signup language</legend>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
            {languages.map((locale) => (
              <label key={locale} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="locale"
                  value={locale}
                  defaultChecked={locale === current}
                  aria-describedby="signup-language-help"
                  className="h-4 w-4 accent-brand"
                />
                <span lang={locale}>{languageName(locale)}</span>
              </label>
            ))}
          </div>
          <p id="signup-language-help" className="mt-2 text-sm text-ink-muted">
            This signup’s page and emails use it for buttons, messages and dates. Write your title
            and slots in the same language.
          </p>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <AsyncSubmitButton
            loadingLabel="Saving…"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:brightness-90"
          >
            Save
          </AsyncSubmitButton>
          {saved ? <SavedNotice role="status" /> : null}
        </div>
      </form>
    </section>
  );
}
