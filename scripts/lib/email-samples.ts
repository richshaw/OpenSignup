/**
 * Each sendable email template with made-up props: what
 * scripts/render-email-templates.ts checks renders, and what `pnpm email:dev`
 * shows. Add a case here whenever a new template gains a `send*` function.
 * The participant emails are here in English and in Swedish, so both render
 * under the worker's toolchain and both can be looked at.
 */
import { createElement, type ReactElement } from 'react';
import type { CatalogLocale } from '@/i18n/config';
import { CommitmentConfirmationEmail } from '@/email/templates/commitment-confirmation';
import { MagicLinkEmail } from '@/email/templates/magic-link';
import { ReminderEmail } from '@/email/templates/reminder';
import { SlotChangedEmail } from '@/email/templates/slot-changed';
import { formatSlotDate } from '@/lib/slot-label';

export interface EmailSample {
  name: string;
  element: ReactElement;
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
    expect: ['https://example.test/login/confirm?token=abc', '123456'],
    lang: 'en',
  },
  {
    name: 'commitment-confirmation',
    element: createElement(CommitmentConfirmationEmail, {
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
    element: createElement(ReminderEmail, {
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
    name: 'slot-changed',
    element: createElement(SlotChangedEmail, {
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
    element: createElement(CommitmentConfirmationEmail, {
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
      'Antal platser:',
      'Din kommentar:',
      'Visa eller ändra din anmälan',
      'Vi skickar också en påminnelse dagen innan.',
    ],
    lang: 'sv',
  },
  {
    name: 'reminder-sv',
    element: createElement(ReminderEmail, {
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
    element: createElement(ReminderEmail, {
      ...swedish,
      unsubscribeUrl: swedishUnsubscribeUrl,
      slotDetails: [
        { label: 'Datum', value: sunday },
        { label: 'Fika', value: 'Frukt' },
      ],
      slotSummary: `${sunday} · Frukt`,
      changed: true,
    }),
    expect: [
      'sön 6 sep.',
      'har flyttat din anmälan till en ny tid sedan vi mejlade dig senast',
      'Här är de nya uppgifterna.',
    ],
    lang: 'sv',
  },
  {
    name: 'slot-changed-sv',
    element: createElement(SlotChangedEmail, {
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
      'har flyttat din anmälan till ett nytt datum eller en ny tid',
      'Stäng av påminnelser och uppdateringar om Lördagsfika',
    ],
    lang: 'sv',
  },
];
