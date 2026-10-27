/**
 * Each sendable email template with made-up props: what
 * scripts/render-email-templates.ts checks renders, and what `pnpm email:dev`
 * shows. Add a case here whenever a new template gains a `send*` function.
 */
import { createElement, type ReactElement } from 'react';
import { CommitmentConfirmationEmail } from '@/email/templates/commitment-confirmation';
import { MagicLinkEmail } from '@/email/templates/magic-link';
import { ReminderEmail } from '@/email/templates/reminder';
import { SlotChangedEmail } from '@/email/templates/slot-changed';

export const emailSamples: Array<[string, ReactElement]> = [
  [
    'magic-link',
    createElement(MagicLinkEmail, {
      url: 'https://example.test/login/confirm?token=abc',
      email: 'organizer@example.test',
      expiresInMinutes: 60,
      codeExpiresInMinutes: 15,
    }),
  ],
  [
    'commitment-confirmation',
    createElement(CommitmentConfirmationEmail, {
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
  ],
  [
    'reminder',
    createElement(ReminderEmail, {
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
  ],
  [
    'slot-changed',
    createElement(SlotChangedEmail, {
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
  ],
];
