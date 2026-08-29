/**
 * Renders every email template and exits non-zero if any of them throws.
 *
 * Exists to be run under the *worker's* toolchain (`tsx --tsconfig
 * tsconfig.worker.json`), which is the only place templates are compiled
 * outside Next.js. See src/email/templates/worker-render.test.ts for why that
 * distinction matters.
 */
import { createElement, type ReactElement } from 'react';
import { renderEmail } from '@/email/render';
import { MagicLinkEmail } from '@/email/templates/magic-link';
import { ReminderEmail } from '@/email/templates/reminder';

const cases: Array<[string, ReactElement]> = [
  [
    'magic-link',
    createElement(MagicLinkEmail, {
      url: 'https://example.test/login/confirm?token=abc',
      email: 'organizer@example.test',
      expiresInMinutes: 60,
    }),
  ],
  [
    'reminder',
    createElement(ReminderEmail, {
      participantName: 'Dana',
      signupTitle: 'Saturday Snack Rotation',
      signupUrl: 'https://example.test/s/snacks',
      slotLabel: 'Week 1',
      slotDateLabel: 'Saturday, September 5',
      notes: 'Bringing grapes',
    }),
  ],
];

async function main(): Promise<void> {
  for (const [name, node] of cases) {
    const { html, text } = await renderEmail(node);
    if (!html.trim() || !text.trim()) {
      throw new Error(`${name} rendered empty output`);
    }
    console.log(`ok ${name}`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
