/**
 * Each sendable email template with made-up props: what
 * scripts/render-email-templates.ts checks renders, and what `pnpm email:dev`
 * shows. Add a case here whenever a new template gains a `send*` function.
 * The participant emails are here in English and in Swedish, so both render
 * under the worker's toolchain and both can be looked at.
 */
import { createElement, type ReactElement } from 'react';
import type { CatalogLocale } from '@/i18n/config';
import { getServerTranslator } from '@/i18n/server';
import { confirmationSubject, reminderSubject, slotChangedSubject } from '@/email/subjects';
import {
  CommitmentConfirmationEmail,
  type CommitmentConfirmationEmailProps,
} from '@/email/templates/commitment-confirmation';
import { MagicLinkEmail } from '@/email/templates/magic-link';
import { ReminderEmail, type ReminderEmailProps } from '@/email/templates/reminder';
import { SlotChangedEmail, type SlotChangedEmailProps } from '@/email/templates/slot-changed';
import { formatSlotDate } from '@/lib/slot-label';

export interface EmailSample {
  name: string;
  element: ReactElement;
  /**
   * Its subject line, made as its `send*` function makes it, so a
   * translation's review reads the subject with the email.
   */
  subject: string;
  /**
   * Distinctive strings the template must put in both its HTML and its text.
   * Asserting on real rendered content rather than "not empty" is what makes
   * the render check notice a template that renders but drops a section —
   * e.g. after gaining a prop its sample does not supply.
   */
  expect: readonly string[];
  /** The language its `<html lang>` must declare. */
  lang: CatalogLocale;
}

/**
 * A participant email's element and its subject, each built as
 * src/email/send.ts builds them, with the subject in the email's language.
 */
function confirmation(props: CommitmentConfirmationEmailProps) {
  const t = getServerTranslator(props.locale, 'email.subject');
  return {
    element: createElement(CommitmentConfirmationEmail, props),
    subject: confirmationSubject(t, props.signupTitle, props.slotSummary),
  };
}
function reminder(props: ReminderEmailProps) {
  const t = getServerTranslator(props.locale, 'email.subject');
  return {
    element: createElement(ReminderEmail, props),
    subject: reminderSubject(t, props.signupTitle, props.slotSummary, props.changed),
  };
}
function slotChanged(props: SlotChangedEmailProps) {
  const t = getServerTranslator(props.locale, 'email.subject');
  return {
    element: createElement(SlotChangedEmail, props),
    subject: slotChangedSubject(t, props.signupTitle, props.slotSummary),
  };
}

/** The Swedish samples' signup, slot and participant. */
const swedish = {
  locale: 'sv',
  participantName: 'Dana',
  signupTitle: 'Lördagsfika',
  manageUrl: 'https://example.test/s/fika/c/com_2?token=abc',
  notes: 'Tar med vindruvor',
} as const;
const swedishUnsubscribeUrl = 'https://example.test/s/fika/unsubscribe?p=par_2&token=abc';
/**
 * The Swedish samples' dates as the app prints them ("lör 5 sep.", with the
 * point `Intl` gives an abbreviated month), so a translation's review reads
 * the emails participants get.
 */
const saturday = formatSlotDate('2026-09-05', 'sv') ?? '';
const sunday = formatSlotDate('2026-09-06', 'sv') ?? '';

export const emailSamples: readonly EmailSample[] = [
  {
    name: 'magic-link',
    element: createElement(MagicLinkEmail, {
      url: 'https://example.test/login/confirm?token=abc',
      email: 'organizer@example.test',
      expiresInMinutes: 60,
      code: '123456',
      codeExpiresInMinutes: 15,
    }),
    // Sent from src/auth/config.ts, which has no subject function to share.
    subject: 'Sign in to OpenSignup',
    expect: ['https://example.test/login/confirm?token=abc', '123456'],
    lang: 'en',
  },
  {
    name: 'commitment-confirmation',
    ...confirmation({
      locale: 'en',
      participantName: 'Dana',
      signupTitle: 'Saturday Snack Rotation',
      manageUrl: 'https://example.test/s/snacks/c/com_1?token=abc',
      slotDetails: [
        { label: 'Date', value: 'Sat, Sep 5' },
        { label: 'Time', value: '09:00' },
        { label: 'Snack', value: 'Fruit' },
      ],
      slotSummary: 'Sat, Sep 5 · 09:00 · Fruit',
      notes: 'Bringing grapes',
      quantity: 2,
      promisesReminder: true,
    }),
    expect: [
      'https://example.test/s/snacks/c/com_1?token=abc',
      'Thanks Dana, you signed up for',
      'Spots:',
      'Your notes:',
      'also send you a reminder the day before.',
    ],
    lang: 'en',
  },
  {
    name: 'reminder',
    ...reminder({
      locale: 'en',
      participantName: 'Dana',
      signupTitle: 'Saturday Snack Rotation',
      manageUrl: 'https://example.test/s/snacks/c/com_1?token=abc',
      unsubscribeUrl: 'https://example.test/s/snacks/unsubscribe?p=par_1&token=abc',
      slotDetails: [
        { label: 'Date', value: 'Sat, Sep 5' },
        { label: 'Snack', value: 'Fruit' },
      ],
      slotSummary: 'Sat, Sep 5 · Fruit',
      notes: 'Bringing grapes',
    }),
    expect: ['Sat, Sep 5', 'this is a reminder that you signed up for', 'Stop reminders for'],
    lang: 'en',
  },
  {
    name: 'reminder-changed',
    ...reminder({
      locale: 'en',
      participantName: 'Dana',
      signupTitle: 'Saturday Snack Rotation',
      manageUrl: 'https://example.test/s/snacks/c/com_1?token=abc',
      unsubscribeUrl: 'https://example.test/s/snacks/unsubscribe?p=par_1&token=abc',
      slotDetails: [
        { label: 'Date', value: 'Sun, Sep 6' },
        { label: 'Snack', value: 'Fruit' },
      ],
      slotSummary: 'Sun, Sep 6 · Fruit',
      notes: 'Bringing grapes',
      changed: true,
    }),
    expect: ['Sun, Sep 6', 'the organizer changed your slot for', 'Here are the new details.'],
    lang: 'en',
  },
  {
    name: 'slot-changed',
    ...slotChanged({
      locale: 'en',
      participantName: 'Dana',
      signupTitle: 'Saturday Snack Rotation',
      manageUrl: 'https://example.test/s/snacks/c/com_1?token=abc',
      unsubscribeUrl: 'https://example.test/s/snacks/unsubscribe?p=par_1&token=abc',
      slotDetails: [
        { label: 'Date', value: 'Sun, Sep 6' },
        { label: 'Snack', value: 'Fruit' },
      ],
      slotSummary: 'Sun, Sep 6 · Fruit',
      notes: null,
    }),
    expect: ['Sun, Sep 6', 'moved your slot to a new date or time', 'Stop reminders and updates'],
    lang: 'en',
  },
  {
    name: 'commitment-confirmation-sv',
    ...confirmation({
      ...swedish,
      slotDetails: [
        { label: 'Datum', value: saturday },
        { label: 'Tid', value: '09:00' },
        { label: 'Fika', value: 'Frukt' },
      ],
      slotSummary: `${saturday} · 09:00 · Frukt`,
      quantity: 2,
      promisesReminder: true,
    }),
    expect: [
      'Tack Dana, du har anmält dig till',
      'Platser:',
      'Din kommentar:',
      'Visa eller ändra din plats',
      'Vi skickar också en påminnelse dagen innan.',
    ],
    lang: 'sv',
  },
  {
    name: 'reminder-sv',
    ...reminder({
      ...swedish,
      unsubscribeUrl: swedishUnsubscribeUrl,
      slotDetails: [
        { label: 'Datum', value: saturday },
        { label: 'Fika', value: 'Frukt' },
      ],
      slotSummary: `${saturday} · Frukt`,
    }),
    expect: [
      'lör 5 sep.',
      'Hej Dana, det här är en påminnelse om att du har anmält dig till',
      'Stäng av påminnelser om Lördagsfika',
    ],
    lang: 'sv',
  },
  {
    name: 'reminder-changed-sv',
    ...reminder({
      ...swedish,
      unsubscribeUrl: swedishUnsubscribeUrl,
      slotDetails: [
        { label: 'Datum', value: sunday },
        { label: 'Fika', value: 'Frukt' },
      ],
      slotSummary: `${sunday} · Frukt`,
      changed: true,
    }),
    expect: ['sön 6 sep.', 'arrangören har ändrat ditt pass i', 'Här är de nya uppgifterna.'],
    lang: 'sv',
  },
  {
    name: 'slot-changed-sv',
    ...slotChanged({
      ...swedish,
      unsubscribeUrl: swedishUnsubscribeUrl,
      slotDetails: [
        { label: 'Datum', value: sunday },
        { label: 'Fika', value: 'Frukt' },
      ],
      slotSummary: `${sunday} · Frukt`,
      notes: null,
    }),
    expect: [
      'sön 6 sep.',
      'har flyttat ditt pass till ett nytt datum eller en ny tid',
      'Stäng av påminnelser och uppdateringar om Lördagsfika',
    ],
    lang: 'sv',
  },
];
