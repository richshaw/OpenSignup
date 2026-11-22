/**
 * Subject lines, shared with the templates so the subject and the in-body
 * preview text can never drift apart. The participant emails' come first;
 * the sign-in email's is at the end.
 *
 * The signup title comes first because that is what identifies the email in a
 * crowded inbox; the slot summary follows so two confirmations from the same
 * signup are still tellable apart. Clients truncate from the right, which
 * costs the detail rather than the identity.
 *
 * Each participant one takes a translator for `email.subject` in the email's language,
 * `getServerTranslator(locale, 'email.subject')`, and a slot summary made in
 * that language too (`commitmentEmailProps` in ./commitment-row.ts). `subjectOf` makes
 * each from the email's own props; the template's preview text, its `send*`
 * function and its sample in scripts/lib/email-samples.ts all go through it,
 * so a new input reaches all three at once.
 */
import type { CatalogLocale } from '@/i18n/config';
import { getServerTranslator } from '@/i18n/server';
import type { Translator } from '@/i18n/translator';

type SubjectTranslator = Translator<'email.subject'>;

function withSummary(t: SubjectTranslator, subject: string, slotSummary: string): string {
  return slotSummary ? t('withSlot', { subject, slot: slotSummary }) : subject;
}

export function confirmationSubject(
  t: SubjectTranslator,
  signupTitle: string,
  slotSummary: string,
): string {
  return withSummary(t, t('signedUp', { title: signupTitle }), slotSummary);
}

/** Same prefix as a reminder for a moved slot: both say the time changed. */
export function slotChangedSubject(
  t: SubjectTranslator,
  signupTitle: string,
  slotSummary: string,
): string {
  return withSummary(t, t('timeChanged', { title: signupTitle }), slotSummary);
}

/**
 * `changed` is for a reminder whose participant was last emailed a different
 * slot time: the organizer moved the slot since, and the subject has to say so
 * or the email reads as a duplicate of the last.
 */
export function reminderSubject(
  t: SubjectTranslator,
  signupTitle: string,
  slotSummary: string,
  changed = false,
): string {
  const title = { title: signupTitle };
  return withSummary(t, changed ? t('timeChanged', title) : t('reminder', title), slotSummary);
}

/** The props of a participant email that its subject is made from. */
interface SubjectProps {
  locale: CatalogLocale;
  signupTitle: string;
  slotSummary: string;
}

/** Each participant email's subject, from its props, in the email's language. */
export const subjectOf = {
  confirmation: ({ locale, signupTitle, slotSummary }: SubjectProps) =>
    confirmationSubject(getServerTranslator(locale, 'email.subject'), signupTitle, slotSummary),
  reminder: ({ locale, signupTitle, slotSummary, changed }: SubjectProps & { changed?: boolean }) =>
    reminderSubject(
      getServerTranslator(locale, 'email.subject'),
      signupTitle,
      slotSummary,
      changed,
    ),
  slotChanged: ({ locale, signupTitle, slotSummary }: SubjectProps) =>
    slotChangedSubject(getServerTranslator(locale, 'email.subject'), signupTitle, slotSummary),
};

/**
 * The sign-in email's subject, from `auth.email` in the email's language:
 * `getServerTranslator(locale, 'auth.email')`, the translator the template
 * gets. Its preview text adds the address, so it's a message of its own
 * (`auth.email.preview`), beside this one.
 */
export function signInSubject(t: Translator<'auth.email'>): string {
  return t('subject');
}
