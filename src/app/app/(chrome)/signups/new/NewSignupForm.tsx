'use client';

import { useActionState } from 'react';
import { AsyncSubmitButton } from '@/components/ui/async-submit-button';
import { FormError } from '@/components/ui/form-error';
import { DESCRIPTION_MAX_LENGTH, TITLE_MAX_LENGTH, TITLE_MIN_LENGTH } from '@/lib/signup-limits';
import { createSignupAction, type NewSignupFormState } from './actions';

const BOX =
  'focus:border-brand focus:ring-brand w-full rounded-lg border border-surface-sunk bg-white px-4 py-3 shadow-sm focus:outline-none focus:ring-1';

/** The form's own words, in the organizer's language (`organizer.newSignup`). */
export interface NewSignupText {
  /** The title box's label. */
  title: string;
  titlePlaceholder: string;
  /** The description box's label. */
  description: string;
  descriptionPlaceholder: string;
  cancel: string;
  /** The submit button while the signup is created. */
  creating: string;
  create: string;
}

/**
 * The manual New signup form. When the server refuses it, the refusal shows
 * above the form and both boxes keep what was typed: React resets a form
 * once its action finishes, so the text comes back as each box's
 * `defaultValue` from the action's answer. Its words come from the page as
 * `text`, so it reads no messages; the refusal comes from the action, worded
 * on the server too.
 */
export function NewSignupForm({
  title,
  description,
  text,
}: {
  title: string | undefined;
  description: string | undefined;
  text: NewSignupText;
}) {
  const [state, formAction] = useActionState<NewSignupFormState, FormData>(
    createSignupAction,
    null,
  );
  return (
    <>
      {state ? <FormError>{state.error}</FormError> : null}
      <form
        action={formAction}
        className="flex flex-col gap-5 rounded-xl border border-surface-sunk bg-white p-6"
      >
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{text.title}</span>
          <input
            type="text"
            name="title"
            required
            minLength={TITLE_MIN_LENGTH}
            maxLength={TITLE_MAX_LENGTH}
            defaultValue={state ? state.title : title}
            placeholder={text.titlePlaceholder}
            className={BOX}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">{text.description}</span>
          <textarea
            name="description"
            rows={4}
            maxLength={DESCRIPTION_MAX_LENGTH}
            defaultValue={state ? state.description : description}
            placeholder={text.descriptionPlaceholder}
            className={BOX}
          />
        </label>
        <div className="flex items-center justify-end gap-3">
          <a
            href="/app"
            className="rounded-lg px-4 py-2 text-sm text-ink-muted transition hover:text-ink"
          >
            {text.cancel}
          </a>
          <AsyncSubmitButton
            loadingLabel={text.creating}
            className="rounded-lg bg-brand px-5 py-2 font-medium text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:brightness-90"
          >
            {text.create}
          </AsyncSubmitButton>
        </div>
      </form>
    </>
  );
}
