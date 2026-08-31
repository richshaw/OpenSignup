/**
 * Renders each sendable email template and exits non-zero if any of them
 * throws. Shared pieces under src/email/templates (layout.tsx) are covered
 * transitively, since every sendable template composes them; add a case here
 * whenever a new template gains a `send*` function.
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

/**
 * A distinctive string each template must put in its output. Asserting on real
 * rendered content rather than "not empty" is what makes the guard notice a
 * template that renders but drops a section — e.g. after gaining a prop the
 * fixture above does not supply.
 */
const expected: Record<string, string> = {
  'magic-link': 'https://example.test/login/confirm?token=abc',
  reminder: 'Saturday Snack Rotation',
};

async function main(): Promise<void> {
  for (const [name, node] of cases) {
    const { html, text } = await renderEmail(node);
    if (!html.trim() || !text.trim()) {
      throw new Error(`${name} rendered empty output`);
    }
    const needle = expected[name];
    if (needle === undefined) {
      throw new Error(`${name} has no expected-content entry; add one`);
    }
    for (const [format, body] of [
      ['html', html],
      ['text', text],
    ] as const) {
      if (!body.includes(needle)) {
        throw new Error(`${name} ${format} output is missing ${JSON.stringify(needle)}`);
      }
    }
    console.log(`ok ${name}`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
