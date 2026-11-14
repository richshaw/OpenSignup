#!/usr/bin/env node
// Which messages does a language need translated?
//
//   pnpm exec tsx .claude/skills/translate/scripts/to-translate.mjs <locale> [--audience participant]
//
// Run with tsx, which resolves the app's `@/` imports: the namespaces an
// audience reads come from AUDIENCE_NAMESPACES in src/i18n/config.ts.
//
// Reads src/messages/en.json, src/messages/<locale>.json and the language's
// record of the English each message was translated from,
// src/i18n/translated-from/<locale>.json, as they are in the working tree,
// uncommitted changes included, and lists, namespace by namespace, in the
// namespaces the audience reads (participant by default):
//   - missing:    a message English has and <locale>.json doesn't;
//   - stale:      a message translated from English that has changed since,
//                 so it may say the old thing;
//   - unrecorded: a translated message the record has no entry for, so
//                 nothing says which English it was translated from;
//   - extra:      a key <locale>.json has and English doesn't: delete it;
//   - unneeded:   a record entry for a message English or <locale>.json no
//                 longer has: mark-translated.mjs drops it.
// Each with its English (and, if stale, the English it was translated from)
// and its translation. Then the mark-translated.mjs command that records the
// listed sections once they're done. It only reads. The catalog check
// (pnpm test src/i18n) reads the same record, and is still the judge of
// placeholders, tags and completeness.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { AUDIENCE_NAMESPACES } from '@/i18n/config';
import { messagesIn, recordFindings } from '@/i18n/testing/catalog-check';
import { TRANSLATED_FROM_DIR, loadTranslatedFrom } from '@/i18n/testing/translated-from';

const fail = (message) => {
  console.error(message);
  process.exit(1);
};
process.chdir(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());

const args = process.argv.slice(2);
const audienceAt = args.indexOf('--audience');
const audience = audienceAt === -1 ? 'participant' : args[audienceAt + 1];
if (audienceAt !== -1) args.splice(audienceAt, 2);
const [locale, ...rest] = args;
if (!locale || locale === 'en') {
  fail('Name the language to translate into, as its catalog is named: to-translate.mjs sv');
}
if (rest.length > 0) {
  fail(
    `Unexpected ${rest.join(' ')}. What's stale comes from ${TRANSLATED_FROM_DIR}/${locale}.json, ` +
      'not from a git base, so there is nothing to compare with.',
  );
}
const namespaces = AUDIENCE_NAMESPACES[audience];
if (!namespaces) {
  fail(`No audience "${audience}": use one of ${Object.keys(AUDIENCE_NAMESPACES).join(', ')}.`);
}
const catalogPath = (code) => `src/messages/${code}.json`;
if (!existsSync(catalogPath(locale))) {
  fail(
    `There's no ${catalogPath(locale)}. Adding a language starts with a catalog of its own: ` +
      'see "Adding a language" in docs/translating.md.',
  );
}

const read = (code) => JSON.parse(readFileSync(catalogPath(code), 'utf8'));
const englishCatalog = read('en');
const ownCatalog = read(locale);
const english = messagesIn(englishCatalog);
const own = messagesIn(ownCatalog);
const record = loadTranslatedFrom(TRANSLATED_FROM_DIR)[locale] ?? {};
const inAudience = (key) => namespaces.includes(key.split('.')[0]);

const found = [];
for (const [key, text] of english) {
  if (inAudience(key) && !own.has(key)) found.push({ status: 'missing', key, text });
}
for (const finding of recordFindings(englishCatalog, ownCatalog, record)) {
  if (!inAudience(finding.key)) continue;
  const { key, status } = finding;
  if (status === 'unneeded') found.push({ status, key, recorded: record[key] });
  else {
    const was = status === 'stale' ? finding.recorded : undefined;
    found.push({ status, key, text: english.get(key), was, translation: own.get(key) });
  }
}
for (const [key, translation] of own) {
  if (inAudience(key) && !english.has(key)) found.push({ status: 'extra', key, translation });
}

const STATUSES = ['missing', 'stale', 'unrecorded', 'extra', 'unneeded'];
const count = (status) => found.filter((item) => item.status === status).length;
console.log(
  `${locale}, ${audience} (${namespaces.join(', ')}): ` +
    STATUSES.map((status) => `${count(status)} ${status}`).join(', '),
);
const show = (value) => JSON.stringify(value);
const label = (name) => `  ${`${name}:`.padEnd(10)}`;
const sectionOf = (key) => key.split('.').slice(0, -1).join('.');
let section = null;
for (const item of found.sort((a, b) => a.key.localeCompare(b.key))) {
  if (sectionOf(item.key) !== section) {
    section = sectionOf(item.key);
    console.log(`\n## ${section}`);
  }
  console.log(`${item.status.padEnd(11)}${item.key}`);
  if (item.was !== undefined) console.log(`${label('en was')}${show(item.was)}`);
  if (item.text !== undefined) console.log(`${label('en')}${show(item.text)}`);
  if (item.translation !== undefined) console.log(`${label(locale)}${show(item.translation)}`);
  if (item.recorded !== undefined) console.log(`${label('recorded')}${show(item.recorded)}`);
}

// Marking a section marks only the messages in it that are translated, and
// those not listed here are up to date already, so once every message listed
// in a section is done, marking the section marks just those.
const toMark = new Set(
  found
    .filter(({ status }) => ['missing', 'stale', 'unrecorded'].includes(status))
    .map(({ key }) => sectionOf(key)),
);
const script = '.claude/skills/translate/scripts/mark-translated.mjs';
if (toMark.size > 0) {
  console.log(
    '\nOnce every message above is translated, or read against its English and found right, ' +
      `record the English each was translated from:\n  pnpm exec tsx ${script} ${locale} ${[...toMark].join(' ')}`,
  );
} else if (count('unneeded') > 0) {
  console.log(`\nDrop the unneeded entries:\n  pnpm exec tsx ${script} ${locale}`);
}
