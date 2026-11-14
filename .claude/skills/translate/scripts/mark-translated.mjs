#!/usr/bin/env node
// Record that messages in a language are translated from today's English.
//
//   pnpm exec tsx .claude/skills/translate/scripts/mark-translated.mjs <locale> [key or section …]
//
// Run with tsx, which resolves the app's `@/` imports.
//
// Run it once you've translated messages into <locale>.json, or read a stale
// one against its new English and found it still right, naming them: a full
// key (participant.dialog.done), or a section or namespace
// (participant.dialog, email) for every message under it. to-translate.mjs
// ends with the command for what it listed.
//
// It writes src/i18n/translated-from/<locale>.json: each named message that
// <locale>.json translates gets the English en.json has for it now. Other
// entries stay as they were (a stale one stays stale), except those for a
// message en.json or <locale>.json no longer has, which go. With no keys, it
// only drops those. Named messages with no translation yet are skipped.
//
// The catalog check trusts this record, so never name a message you haven't
// translated or checked against its English: it would stop being reported.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  TRANSLATED_FROM_DIR,
  loadTranslatedFrom,
  markTranslated,
} from '@/i18n/testing/translated-from';

const fail = (message) => {
  console.error(message);
  process.exit(1);
};
process.chdir(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());

const [locale, ...names] = process.argv.slice(2);
if (!locale || locale === 'en') {
  fail('Name the language, as its catalog is named: mark-translated.mjs sv participant.dialog');
}
const catalogPath = (code) => `src/messages/${code}.json`;
if (!existsSync(catalogPath(locale))) fail(`There's no ${catalogPath(locale)}.`);
const read = (code) => JSON.parse(readFileSync(catalogPath(code), 'utf8'));

const recordPath = `${TRANSLATED_FROM_DIR}/${locale}.json`;
const result = markTranslated(
  read('en'),
  read(locale),
  loadTranslatedFrom(TRANSLATED_FROM_DIR)[locale] ?? {},
  names,
);
if (result.unknown.length > 0) {
  fail(
    `No English message is or is under ${result.unknown.join(', ')}. ` +
      'Name full keys (participant.dialog.done) or sections (participant.dialog). Nothing written.',
  );
}

mkdirSync(TRANSLATED_FROM_DIR, { recursive: true });
// As Prettier writes JSON, so `pnpm format:check` passes.
writeFileSync(recordPath, `${JSON.stringify(result.record, null, 2)}\n`);

const stale = result.marked.filter(({ was }) => was !== undefined);
console.log(
  `${recordPath}: marked ${result.marked.length} as translated from today's English ` +
    `(${stale.length} stale, ${result.marked.length - stale.length} not recorded before); ` +
    `dropped ${result.dropped.length}; skipped ${result.untranslated.length} with no translation yet.`,
);
const list = (heading, keys) => {
  if (keys.length > 0) console.log(`${heading}\n${keys.map((key) => `  ${key}`).join('\n')}`);
};
list(
  'Marked:',
  result.marked.map(({ key }) => key),
);
list('Dropped (no longer in en.json or the translation):', result.dropped);
list('Skipped (not translated yet):', result.untranslated);
