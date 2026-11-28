/**
 * Each sendable email template with made-up props: what
 * scripts/render-email-templates.ts checks renders, and what `pnpm email:dev`
 * shows. Add a case here whenever a new template gains a `send*` function.
 * The participant emails and the sign-in email are here in English and in
 * every test language (`TEST_LOCALES`: each language with a catalog), so
 * each renders under the worker's toolchain and can be looked at. A language
 * needs nothing written here: its samples and what they must say come from
 * its catalog.
 */
import { createElement, type ReactElement } from 'react';
import type { CatalogLocale } from '@/i18n/config';
import { getServerTranslator } from '@/i18n/server';
import { TEST_LOCALES, type TestLocale } from '@/i18n/testing/locales';
import { signInSubject, subjectOf } from '@/email/subjects';
import {
  CommitmentConfirmationEmail,
  type CommitmentConfirmationEmailProps,
} from '@/email/templates/commitment-confirmation';
import { MagicLinkEmail } from '@/email/templates/magic-link';
import { ReminderEmail, type ReminderEmailProps } from '@/email/templates/reminder';
import { SlotChangedEmail, type SlotChangedEmailProps } from '@/email/templates/slot-changed';
import { formatDuration } from '@/lib/format-duration';
import { REMINDER_LEAD_HOURS } from '@/lib/reminder-lead';
import { formatSlotDate, formatSlotTime } from '@/lib/slot-label';

interface EmailSample {
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
  return {
    element: createElement(CommitmentConfirmationEmail, props),
    subject: subjectOf.confirmation(props),
  };
}
function reminder(props: ReminderEmailProps) {
  return {
    element: createElement(ReminderEmail, props),
    subject: subjectOf.reminder(props),
  };
}
function slotChanged(props: SlotChangedEmailProps) {
  return {
    element: createElement(SlotChangedEmail, props),
    subject: subjectOf.slotChanged(props),
  };
}

/**
 * The sign-in email in `locale`, as src/auth/config.ts sends it to an account
 * in that language: `magic-link` in English, and named with the language
 * after it in any other (`magic-link-sv`). Its button and its code's sentence
 * come from the catalog, so a language needs nothing written here.
 */
function signIn(locale: CatalogLocale): EmailSample {
  const t = getServerTranslator(locale, 'auth.email');
  const url = 'https://example.test/login/confirm?token=abc';
  return {
    name: locale === 'en' ? 'magic-link' : `magic-link-${locale}`,
    element: createElement(MagicLinkEmail, {
      locale,
      url,
      email: 'organizer@example.test',
      expiresInMinutes: 60,
      code: '123456',
      codeExpiresInMinutes: 15,
    }),
    subject: signInSubject(t),
    expect: [url, '123456', t('signIn'), t('code', { duration: formatDuration(15, locale) })],
    lang: locale,
  };
}

/**
 * The English confirmation's time as the app prints it ("9:00 AM"), as the
 * other languages' dates and times are below, so its text and subject read
 * as sent.
 */
const nineAm = formatSlotTime('09:00', 'en') ?? '';

/**
 * What an organizer and a participant writing in a test language would give
 * its samples: the signup's title, a field's label and value, and a note. A
 * language with no entry gets `ANY_LANGUAGE`'s. The date field's label is
 * the language's own (`participant.defaults`), as on a new signup.
 */
interface SampleText {
  signupTitle: string;
  /** The signup's address, in its links. */
  slug: string;
  notes: string;
  /** The time field's label, and another field's label and its value. */
  labels: { time: string; item: string };
  item: string;
}

const SAMPLE_TEXT: { [L in TestLocale]?: SampleText } = {
  sv: {
    signupTitle: 'Lördagsfika',
    slug: 'fika',
    notes: 'Tar med vindruvor',
    labels: { time: 'Tid', item: 'Fika' },
    item: 'Frukt',
  },
  de: {
    signupTitle: 'Kaffee und Kuchen',
    slug: 'kuchen',
    notes: 'Bringe Weintrauben mit',
    labels: { time: 'Uhrzeit', item: 'Essen' },
    item: 'Obst',
  },
};

/** For a language with none of its own: names that read as names in most languages. */
const ANY_LANGUAGE: SampleText = {
  signupTitle: 'Café Mozart',
  slug: 'mozart',
  notes: '🍇',
  labels: { time: 'hh:mm', item: '☕' },
  item: 'Croissant',
};

/**
 * A message as both an email's HTML and its text print it: the stretches of
 * text around and inside its tags, each whole, since a tag splits the HTML
 * there. Stretches with no letter (a full stop after a tag, a number) are
 * left out.
 */
function printed(markup: (tags: Record<'b', (chunks: string) => string>) => string): string[] {
  const cut = '\u0000';
  return markup({ b: (chunks) => `${cut}${chunks}${cut}` })
    .split(cut)
    .map((piece) => piece.trim())
    .filter((piece) => /\p{L}/u.test(piece));
}

/**
 * The participant emails in `locale`, as sent for a signup in it, named after
 * the English sample they match with the language after it
 * (`reminder-sv`). Each must print the date the app prints, and every
 * sentence it adds around its slot's details, from the catalog.
 */
function participantSamples(locale: TestLocale): EmailSample[] {
  const text = SAMPLE_TEXT[locale] ?? ANY_LANGUAGE;
  const common = getServerTranslator(locale, 'email.common');
  const details = getServerTranslator(locale, 'email.slotDetails');
  const confirmationText = getServerTranslator(locale, 'email.confirmation');
  const reminderText = getServerTranslator(locale, 'email.reminder');
  const slotChangedText = getServerTranslator(locale, 'email.slotChanged');
  const dateLabel = getServerTranslator(locale, 'participant.defaults')('date');
  const person = {
    locale,
    participantName: 'Dana',
    signupTitle: text.signupTitle,
    manageUrl: `https://example.test/s/${text.slug}/c/com_2?token=abc`,
    notes: text.notes,
  };
  const intro = { name: person.participantName, title: text.signupTitle };
  const unsubscribeUrl = `https://example.test/s/${text.slug}/unsubscribe?p=par_2&token=abc`;
  // The dates and the time as the app prints them, so a translation's review
  // reads the emails participants get.
  const saturday = formatSlotDate('2026-09-05', locale) ?? '';
  const sunday = formatSlotDate('2026-09-06', locale) ?? '';
  const nine = formatSlotTime('09:00', locale) ?? '';
  const onDay = (day: string) => [
    { label: dateLabel, value: day },
    { label: text.labels.item, value: text.item },
  ];
  return [
    {
      name: `commitment-confirmation-${locale}`,
      ...confirmation({
        ...person,
        slotDetails: [
          { label: dateLabel, value: saturday },
          { label: text.labels.time, value: nine },
          { label: text.labels.item, value: text.item },
        ],
        slotSummary: `${saturday} · ${nine} · ${text.item}`,
        quantity: 2,
        promisesReminder: true,
      }),
      expect: [
        ...printed((tags) => confirmationText.markup('intro', { ...intro, ...tags })),
        ...printed((tags) =>
          details.markup('line', { label: details('spots'), value: '2', ...tags }),
        ),
        ...printed((tags) => common.markup('notes', { notes: text.notes, ...tags })),
        common('manage'),
        confirmationText('keep', { reminder: 'yes', hours: REMINDER_LEAD_HOURS }),
      ],
      lang: locale,
    },
    {
      name: `reminder-${locale}`,
      ...reminder({
        ...person,
        unsubscribeUrl,
        slotDetails: onDay(saturday),
        slotSummary: `${saturday} · ${text.item}`,
        quantity: 2,
      }),
      expect: [
        saturday,
        ...printed((tags) =>
          details.markup('line', { label: details('spots'), value: '2', ...tags }),
        ),
        ...printed((tags) => reminderText.markup('intro', { ...intro, ...tags })),
        reminderText('stop', { title: text.signupTitle }),
      ],
      lang: locale,
    },
    {
      name: `reminder-changed-${locale}`,
      ...reminder({
        ...person,
        unsubscribeUrl,
        slotDetails: onDay(sunday),
        slotSummary: `${sunday} · ${text.item}`,
        changed: true,
      }),
      expect: [
        sunday,
        ...printed((tags) => reminderText.markup('changed.intro', { ...intro, ...tags })),
      ],
      lang: locale,
    },
    {
      name: `slot-changed-${locale}`,
      ...slotChanged({
        ...person,
        unsubscribeUrl,
        slotDetails: onDay(sunday),
        slotSummary: `${sunday} · ${text.item}`,
        notes: null,
        quantity: 2,
      }),
      expect: [
        sunday,
        ...printed((tags) =>
          details.markup('line', { label: details('spots'), value: '2', ...tags }),
        ),
        ...printed((tags) => slotChangedText.markup('intro', { ...intro, ...tags })),
        slotChangedText('stop', { title: text.signupTitle }),
      ],
      lang: locale,
    },
  ];
}

export const emailSamples: readonly EmailSample[] = [
  signIn('en'),
  {
    name: 'commitment-confirmation',
    ...confirmation({
      locale: 'en',
      participantName: 'Dana',
      signupTitle: 'Saturday Snack Rotation',
      manageUrl: 'https://example.test/s/snacks/c/com_1?token=abc',
      slotDetails: [
        { label: 'Date', value: 'Sat, Sep 5' },
        { label: 'Time', value: nineAm },
        { label: 'Snack', value: 'Fruit' },
      ],
      slotSummary: `Sat, Sep 5 · ${nineAm} · Fruit`,
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
      quantity: 2,
    }),
    expect: [
      'Sat, Sep 5',
      'this is a reminder that you signed up for',
      'Spots:',
      'Stop reminders for',
    ],
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
      quantity: 2,
    }),
    expect: [
      'Sun, Sep 6',
      'moved your slot to a new date or time',
      'Spots:',
      'Stop reminders and updates',
    ],
    lang: 'en',
  },
  ...TEST_LOCALES.flatMap((locale) => [...participantSamples(locale), signIn(locale)]),
];
