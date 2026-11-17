import { requireOrganizerSession, toActor } from '@/auth/session';
import { AsyncSubmitButton } from '@/components/ui/async-submit-button';
import { SavedNotice } from '@/components/ui/save-notice';
import { LanguageRadios } from '@/components/ui/language-radios';
import type { CatalogLocale } from '@/i18n/config';
import { getServerTranslator } from '@/i18n/server';
import type { Translator } from '@/i18n/translator';
import { localeOfOrganizer, localeOfSignup, offersLanguageChoice } from '@/i18n/locale';
import { refusalFromQuery } from '@/lib/organizer-errors';
import { requiresEmail } from '@/schemas/signups';
import { loadSignupForOrganizer } from '@/services/signups.cached';
import { trackOrganizerView } from '@/lib/view-tracker';
import { FormError } from '@/components/ui/form-error';
import { saveSignupSettingsAction } from '../actions';
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

  // The tab is in the organizer's language. A refused save or delete comes
  // back as its code, worded here.
  const locale = localeOfOrganizer(session);
  const t = getServerTranslator(locale, 'organizer.signupSettings');
  const savedText = getServerTranslator(locale, 'organizer.saveNotice')('saved');
  const refusal = refusalFromQuery(getServerTranslator(locale, 'organizer.errors'), error);

  // Reminders are configured on the date field itself, in the Build tab's
  // field editor. This tab keeps what has no better home: whether the sign-up
  // form asks for an email, the signup's language once there's a choice, and
  // deletion. The first two are one form with one Save (#899's tophat: with a
  // Save on each card, saving one dropped an unsaved change in the other
  // without a word).
  const current = signupLanguage(sig.settings.locale);
  return (
    <section className="max-w-2xl space-y-6">
      {refusal ? <FormError>{refusal}</FormError> : null}
      {/* A plain form, so this tab adds no script of its own. Keyed on the
          stored values, so after a save the choices shown are the saved ones.
          Gap, not space-y: the server's render starts the form with React's
          hidden action inputs and a client render doesn't, so sibling margins
          moved the first section 4px after a save. Each choice also sends the
          value it was shown with, so Save sends only what changed
          (`saveSignupSettingsAction`). */}
      <form
        key={`${requireEmail}-${current ?? ''}`}
        action={saveSignupSettingsAction.bind(null, id)}
        className="flex flex-col gap-4 rounded-xl border border-surface-sunk bg-white p-6"
      >
        <section aria-labelledby="signup-form-heading" className="space-y-3">
          <h2 id="signup-form-heading" className="text-sm font-semibold">
            {t('signupForm.title')}
          </h2>
          {/* Each choice has its own line, and CSS shows the one picked, so it
              follows the radio before a save with no script. A screen reader
              hears each line with its own radio. */}
          <fieldset className="group">
            <legend className="text-sm font-medium">{t('signupForm.askForEmail')}</legend>
            <input
              type="hidden"
              name="requireEmailShown"
              value={requireEmail ? 'required' : 'optional'}
            />
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
                {t('signupForm.required')}
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
                {t('signupForm.optional')}
              </label>
            </div>
            <p
              id="require-email-required-help"
              className="mt-2 text-sm text-ink-muted group-has-[#require-email-optional:checked]:hidden"
            >
              {t('signupForm.requiredHelp')}
            </p>
            <p
              id="require-email-optional-help"
              className="mt-2 hidden text-sm text-ink-muted group-has-[#require-email-optional:checked]:block"
            >
              {t('signupForm.optionalHelp')}
            </p>
          </fieldset>
        </section>
        {current ? <SignupLanguageSection current={current} t={t} /> : null}
        <div className="flex flex-wrap items-center gap-3">
          <AsyncSubmitButton
            loadingLabel={t('saving')}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:brightness-90"
          >
            {t('save')}
          </AsyncSubmitButton>
          {saved === '1' ? <SavedNotice role="status">{savedText}</SavedNotice> : null}
        </div>
      </form>
      <section
        aria-labelledby="delete-signup-heading"
        className="space-y-3 rounded-xl border border-danger/30 bg-danger/5 p-6"
      >
        <div>
          <h2 id="delete-signup-heading" className="text-sm font-semibold text-danger">
            {t('delete.title')}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">{t('delete.body')}</p>
        </div>
        {/* A client component, so it takes its words as props and the page
            sends no messages to the browser. */}
        <DeleteSignupForm
          signupId={id}
          text={{
            start: t('delete.start'),
            label: t('delete.label'),
            question: t('delete.question'),
            confirm: t('delete.confirm'),
            deleting: t('delete.deleting'),
            cancel: t('delete.cancel'),
          }}
        />
      </section>
    </section>
  );
}

/**
 * The language the Settings tab shows as the signup's: the one its pages use
 * (`localeOfSignup`), so a signup with no language of its own, or one that has
 * since left the list, shows the instance's, and the choice shown is always
 * one that saves. None while one language has shipped to participants:
 * there's nothing to choose, so the tab has no "Signup language".
 */
function signupLanguage(stored: unknown): CatalogLocale | null {
  return offersLanguageChoice() ? localeOfSignup(stored) : null;
}

/**
 * The Settings tab's "Signup language": the language the signup's page and
 * emails use, a section of the tab's one form, saved by its Save. Each
 * language is named in itself (English, Svenska), so the organizer finds
 * theirs whatever language the rest of the tab is in; its own words are in
 * the organizer's (`t`).
 */
function SignupLanguageSection({
  current,
  t,
}: {
  /** The language shown as chosen (`signupLanguage`). */
  current: CatalogLocale;
  t: Translator<'organizer.signupSettings'>;
}) {
  return (
    <section
      aria-labelledby="signup-language-heading"
      className="space-y-3 border-t border-surface-sunk pt-4"
    >
      <h2 id="signup-language-heading" className="text-sm font-semibold">
        {t('language.title')}
      </h2>
      <fieldset>
        <legend className="text-sm font-medium">{t('language.legend')}</legend>
        <input type="hidden" name="localeShown" value={current} />
        <LanguageRadios current={current} describedBy="signup-language-help" />
        <p id="signup-language-help" className="mt-2 text-sm text-ink-muted">
          {t('language.help')}
        </p>
      </fieldset>
    </section>
  );
}
