/**
 * Translates messages through the server translator and exits non-zero if they
 * don't come out as expected, or if anything from Next was loaded on the way.
 *
 * Exists to be run under the *worker's* toolchain (`tsx --tsconfig
 * tsconfig.worker.json`): the reminder worker renders emails outside Next, so
 * the translator, its catalogs and `src/i18n/server.ts` must load there too.
 * The worker reads the raw JSON and formats it with use-intl's full formatter,
 * unlike the web build, which precompiles the catalogs, so one message here
 * has an argument. The email subjects the worker sends come out here too, in
 * English exactly as they always have, and in Swedish; the web process's
 * side of the same subjects is checked in src/email/subjects.test.ts. See
 * src/email/templates/worker-render.test.ts.
 */
import { confirmationSubject, reminderSubject, slotChangedSubject } from '@/email/subjects';
import { getServerTranslator } from '@/i18n/server';

/** One `ok` line for `texts`, each `[key, text, expected]`, or a throw for the first that differs. */
function check(label: string, texts: readonly (readonly [string, string, string])[]): string {
  for (const [key, text, expected] of texts) {
    if (text !== expected) throw new Error(`${key} came out as ${JSON.stringify(text)}`);
  }
  return `ok ${label} ${texts.map(([, text]) => text).join(' | ')}`;
}

const t = getServerTranslator('en', 'common.footer');
const footer = check('translator', [
  ['common.footer.help', t('help'), 'Help'],
  ['common.footer.license', t('license', { instance: 'Example' }), 'Example · AGPL-3.0'],
]);

const en = getServerTranslator('en', 'email.subject');
const sv = getServerTranslator('sv', 'email.subject');
const subjects = check('subjects', [
  [
    'reminder',
    reminderSubject(en, "Pat's {bake} sale", 'Sat, May 2 · 1:00\u00a0PM'),
    "Reminder: Pat's {bake} sale · Sat, May 2 · 1:00\u00a0PM",
  ],
  ['changed reminder', reminderSubject(en, 'Bake sale', '', true), 'Time changed: Bake sale'],
  [
    'slot changed',
    slotChangedSubject(en, 'Bake sale', 'Cookies'),
    'Time changed: Bake sale · Cookies',
  ],
  ['confirmation', confirmationSubject(en, 'Bake sale', ''), "You're signed up: Bake sale"],
  [
    'Swedish reminder',
    reminderSubject(sv, 'Loppis', 'lör 2 maj · 13:00'),
    'Påminnelse: Loppis · lör 2 maj · 13:00',
  ],
  ['Swedish slot changed', slotChangedSubject(sv, 'Loppis', ''), 'Ny tid: Loppis'],
]);

// The worker imports src/i18n/server.ts, so nothing it loads may need Next.
const fromNext = Object.keys(require.cache).filter((path) =>
  /[\\/]node_modules[\\/]next[\\/]/.test(path),
);
if (fromNext.length > 0) {
  throw new Error(`loaded from Next: ${fromNext.join(', ')}`);
}

console.log(`${footer}\n${subjects}`);
