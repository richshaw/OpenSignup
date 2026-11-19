#!/usr/bin/env node
// What does the app put into a language's sentences?
//
//   pnpm exec tsx .claude/skills/translate/scripts/language-facts.mjs <locale>
//
// Run with tsx, which resolves the app's `@/` imports. Before a language's
// glossary is written, it prints, in that language, the values the app's own
// code formats and drops into its messages, so the glossary and the
// translation can be checked against them rather than against a guess:
//   - its plural categories, and which number picks each (every plural
//     needs a branch for each category: the catalog check fails one that
//     lacks it);
//   - a slot's date and time as the signup's page and its emails show them
//     (formatSlotDate, formatSlotTime), and whether a date can end in its
//     own full stop, so a sentence mustn't end on a slot's name;
//   - numbers, with and without `::group-off`;
//   - the durations the app writes into a sentence ({duration}, {wait}),
//     from formatDuration and waitInMinutes;
//   - each language's name, in a list and inside a sentence
//     (languageName, languageNameInSentence);
//   - an organizer's field label inside a sentence (labelInSentence), which
//     only a row in CAPITALIZES_NOUNS (src/i18n/config.ts) changes.
// It works for a language with no catalog yet, and only reads.
import {
  CATALOG_LOCALES,
  labelInSentence,
  languageName,
  languageNameInSentence,
} from '@/i18n/config';
import { formatDuration, waitInMinutes } from '@/lib/format-duration';
import { formatSlotDate, formatSlotTime } from '@/lib/slot-label';

const locale = process.argv[2];
if (!locale || !/^[a-z]{2,3}$/.test(locale)) {
  console.error('Usage: language-facts.mjs <locale>, a bare language code such as fr');
  process.exit(1);
}

const show = (label, value) => console.log(`  ${label.padEnd(26)} ${JSON.stringify(value)}`);

console.log(`## Plurals`);
const plurals = new Intl.PluralRules(locale);
const categories = plurals.resolvedOptions().pluralCategories;
show('categories', categories);
for (const category of categories) {
  const numbers = [0, 1, 2, 3, 5, 11, 21, 100, 1_000_000].filter(
    (n) => plurals.select(n) === category,
  );
  show(category, numbers.join(', '));
}

console.log(`\n## A slot's date and time`);
for (const iso of ['2026-05-03', '2026-09-05', '2026-12-08']) {
  const date = formatSlotDate(iso, locale);
  show(iso, date + (date?.endsWith('.') ? '   <- ends in a full stop' : ''));
}
for (const hhmm of ['09:00', '18:30']) show(hhmm, formatSlotTime(hhmm, locale));

console.log(`\n## Numbers`);
show('{n, number}', new Intl.NumberFormat(locale).format(1234567));
show(
  '{n, number, ::group-off}',
  new Intl.NumberFormat(locale, { useGrouping: false }).format(1234567),
);

console.log(`\n## Durations in a sentence`);
for (const minutes of [1, 15, 60, 90, 24 * 60, 7 * 24 * 60]) {
  show(`{duration}, ${minutes} min`, formatDuration(minutes, locale));
}
show('{wait}, 300 s', waitInMinutes(300, locale));

console.log(`\n## Language names: the choice lists them in their own words`);
const languages = [...new Set([...CATALOG_LOCALES, locale])];
for (const other of languages) {
  show(
    other,
    `${languageName(other)} in the list, ${languageNameInSentence(other, locale)} in a sentence (${locale} itself says ${languageName(other, locale)})`,
  );
}

console.log(`\n## An organizer's field label in a sentence`);
show('labelInSentence("Date")', labelInSentence('Date', locale));
console.log(
  `  It's lowercased unless ${locale} has a row in CAPITALIZES_NOUNS saying it capitalizes nouns.`,
);
