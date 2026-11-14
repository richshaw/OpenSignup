import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { CATALOG_LOCALES } from '@/i18n/config';
import { getTranslator } from '@/i18n/translator';
import { renderEmail } from '../render';
import { ReminderEmail } from './reminder';
import { SlotChangedEmail } from './slot-changed';

const unsubscribeUrl = 'https://example.com/s/bake-sale/unsubscribe?t=fake-token';

const props = {
  locale: 'en' as const,
  participantName: 'Pat',
  signupTitle: 'Bake sale',
  manageUrl: 'https://example.com/s/bake-sale/c/fake',
  slotDetails: [{ label: 'What', value: 'Cookies' }],
  slotSummary: 'Cookies',
  unsubscribeUrl,
};

/** The email's plain text, with the 80-column wrapping undone. */
async function textOf(email: ReactElement): Promise<string> {
  const { text } = await renderEmail(email);
  // Plaintext wraps at 80 columns, so any space may come out as a newline.
  return text.replace(/\s+/g, ' ').trimEnd();
}

/**
 * Nothing may follow the opt-out link: in plaintext react-email prints it as
 * "label\nURL", and clients that autolink plaintext swallow any trailing
 * punctuation into the URL.
 */
describe('unsubscribe footer', () => {
  it.each([
    [
      'reminder',
      <ReminderEmail key="r" {...props} />,
      "You'll still get a confirmation if you sign up for something new. Stop reminders for Bake sale",
    ],
    [
      'slot-changed',
      <SlotChangedEmail key="s" {...props} />,
      "You'll still get a confirmation if you sign up for something new. Stop reminders and updates for Bake sale",
    ],
    [
      'Swedish reminder',
      <ReminderEmail key="r" {...props} locale="sv" />,
      'Du får fortfarande en bekräftelse om du anmäler dig till något nytt. Stäng av påminnelser om Bake sale',
    ],
    [
      'Swedish slot-changed',
      <SlotChangedEmail key="s" {...props} locale="sv" />,
      'Du får fortfarande en bekräftelse om du anmäler dig till något nytt. Stäng av påminnelser och uppdateringar om Bake sale',
    ],
  ])('ends the %s email with the link label and its URL', async (_name, email, footer) => {
    expect((await textOf(email)).endsWith(`${footer} ${unsubscribeUrl}`)).toBe(true);
    const { html } = await renderEmail(email);
    expect(html).toContain(`href="${unsubscribeUrl}"`);
  });

  // The sentence and the link's label are separate messages, and the link is
  // laid out after the sentence, so a translation can't put words after it.
  // This holds it for every language with a catalog, translated or not.
  it.each(
    CATALOG_LOCALES.flatMap(
      (locale) =>
        [
          [locale, 'reminder', ReminderEmail, 'email.reminder'],
          [locale, 'slot-changed', SlotChangedEmail, 'email.slotChanged'],
        ] as const,
    ),
  )('keeps the link last in %s, in the %s email', async (locale, _name, Email, namespace) => {
    const label = getTranslator(locale, namespace, {
      onError: (error) => {
        throw error;
      },
    })('stop', { title: props.signupTitle });
    const email = <Email {...props} locale={locale} />;
    const { html } = await renderEmail(email);
    // The label is the link's whole text, and the link ends its paragraph.
    expect(html).toContain(`>${label}</a></p>`);
    expect((await textOf(email)).endsWith(`${label} ${unsubscribeUrl}`)).toBe(true);
  });
});
