import { requireOrganizerSession, toActor } from '@/auth/session';
import { AsyncSubmitButton } from '@/components/ui/async-submit-button';
import { SavedNotice } from '@/components/ui/save-notice';
import { type CatalogLocale, SHIPPED, defaultFor, languageName } from '@/i18n/config';
import { instanceDefaultLocale } from '@/i18n/server';
import { requiresEmail } from '@/schemas/signups';
import { loadSignupForOrganizer } from '@/services/signups.cached';
import { trackOrganizerView } from '@/lib/view-tracker';
import { FormError } from '@/components/ui/form-error';
import { setRequireEmailAction, setSignupLocaleAction } from '../actions';
import { DeleteSignupForm } from './delete-signup-form';

type PageParams = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
};

export default async function SettingsTab({ params, searchParams }: PageParams) {
  const { id } = await params;
  const { error, saved } = await searchParams;
  const session = await requireOrganizerSession();
  const result = await loadSignupForOrganizer(toActor(session), id);
  if (!result.ok) return null;
  const sig = result.value;
  const requireEmail = requiresEmail(sig.settings);
  await trackOrganizerView({
    actor: toActor(session),
    signupId: sig.id,
    workspaceId: sig.workspaceId,
    eventType: 'signup.editor_opened',
    payload: { section: 'settings' },
  });

  // Reminders are configured on the date field itself, in the Build tab's
  // field editor. This tab keeps what has no better home: whether the sign-up
  // form asks for an email, the signup's language once there's a choice, and
  // deletion. Each form's own `saved` value says which one shows "Saved".
  return (
    <section className="max-w-2xl space-y-6">
      {error ? <FormError>{error}</FormError> : null}
      <section
        aria-labelledby="signup-form-heading"
        className="space-y-3 rounded-xl border border-surface-sunk bg-white p-6"
      >
        <h2 id="signup-form-heading" className="text-sm font-semibold">
          Sign-up form
        </h2>
        {/* A plain form, so this tab adds no script of its own. Keyed on the
            stored value, so after a save the choice shown is the saved one.
            Gap, not space-y: the server's render starts the form with React's
            hidden action inputs and a client render doesn't, so sibling margins
            moved the fieldset 4px after a save. */}
        <form
          key={String(requireEmail)}
          action={setRequireEmailAction.bind(null, id)}
          className="flex flex-col gap-4"
        >
          {/* Each choice has its own line, and CSS shows the one picked, so it
              follows the radio before a save with no script. A screen reader
              hears each line with its own radio. */}
          <fieldset className="group">
            <legend className="text-sm font-medium">Ask for an email address</legend>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="requireEmail"
                  value="required"
                  defaultChecked={requireEmail}
                  aria-describedby="require-email-required-help"
                  className="h-4 w-4 accent-brand"
                />
                Required
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  id="require-email-optional"
                  type="radio"
                  name="requireEmail"
                  value="optional"
                  defaultChecked={!requireEmail}
                  aria-describedby="require-email-optional-help"
                  className="h-4 w-4 accent-brand"
                />
                Optional
              </label>
            </div>
            <p
              id="require-email-required-help"
              className="mt-2 text-sm text-ink-muted group-has-[#require-email-optional:checked]:hidden"
            >
              We email everyone their link to change or cancel.
            </p>
            <p
              id="require-email-optional-help"
              className="mt-2 hidden text-sm text-ink-muted group-has-[#require-email-optional:checked]:block"
            >
              People can leave it blank. They get no emails, not even reminders, so they need to
              save their link. If they lose it, they can sign up again and you can remove the old
              one on the Responses tab.
            </p>
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <AsyncSubmitButton
              loadingLabel="Saving…"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:brightness-90"
            >
              Save
            </AsyncSubmitButton>
            {saved === '1' ? <SavedNotice role="status" /> : null}
          </div>
        </form>
      </section>
      <SignupLanguageForm signupId={id} stored={sig.settings.locale} saved={saved === 'language'} />
      <section
        aria-labelledby="danger-zone-heading"
        className="space-y-3 rounded-xl border border-danger/30 bg-danger/5 p-6"
      >
        <div>
          <h2 id="danger-zone-heading" className="text-sm font-semibold text-danger">
            Danger zone
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Deleting removes this signup from your dashboard and immediately makes its public link
            inaccessible.
          </p>
        </div>
        <DeleteSignupForm signupId={id} />
      </section>
    </section>
  );
}

/**
 * The Settings tab's "Signup language": the language the signup's page and
 * emails use. With one language shipped to participants there's nothing to
 * choose, so it renders nothing until a second one ships. A plain form like
 * "Ask for an email address", so it adds no script. Each language is named in
 * itself (English, Svenska), so the organizer finds theirs whatever language
 * the rest of the tab is in.
 *
 * Kept in this file: in one of its own, a second server import of
 * AsyncSubmitButton added a few bytes to that button's module on every page
 * that loads it.
 */
function SignupLanguageForm({
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
