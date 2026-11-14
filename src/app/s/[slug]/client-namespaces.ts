import type { Namespace } from '@/i18n/translator';

/**
 * The sections of the catalog each participant form reads with
 * `useTranslations`, and so what its page gives `ClientMessages` through
 * `messagesFor`: every one it reads, and no others, since each goes into the
 * page's HTML and RSC payload. Here rather than beside the forms, because a
 * value a `'use client'` module exports reaches a server component as a
 * client reference, not as the value.
 */

/** The sign-up dialog (`./commit-dialog.tsx`, with `./participant-fields.tsx`). */
export const COMMIT_DIALOG_NAMESPACES = [
  'participant.dialog',
  'participant.fields',
  'participant.slot',
  'participant.errors',
] as const satisfies readonly Namespace[];

/** The edit page's form (`./c/[id]/edit-form.tsx`, with `./participant-fields.tsx`). */
export const EDIT_FORM_NAMESPACES = [
  'participant.fields',
  'participant.errors',
] as const satisfies readonly Namespace[];
