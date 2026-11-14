#!/usr/bin/env node
// Which messages does a language need translated?
//
//   pnpm exec tsx .claude/skills/translate/scripts/to-translate.mjs <locale> [base-ref] [--audience participant]
//
// Run with tsx, which resolves the app's `@/` imports: the namespaces an
// audience reads come from AUDIENCE_NAMESPACES in src/i18n/config.ts.
//
// Reads src/messages/en.json and src/messages/<locale>.json as they are in the
// working tree, uncommitted changes included, and lists, namespace by
// namespace, in the namespaces the audience reads (participant by default):
//   - missing: a message English has and <locale>.json doesn't;
//   - stale:   a message whose English this branch changed since base-ref
//              (default: where the branch left origin/main) while its
//              translation stayed as it was, so it may say the old thing;
//   - check:   a message whose English and translation both changed on this
//              branch: read the two together;
//   - extra:   a key <locale>.json has and English doesn't: delete it.
// Each with its English (and the English it replaced) and its translation.
// It only reads. The catalog check (pnpm test src/i18n) is still the judge of
// placeholders, tags and completeness.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { AUDIENCE_NAMESPACES } from '@/i18n/config';

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const fail = (message) => {
  console.error(message);
  process.exit(1);
};
process.chdir(git('rev-parse', '--show-toplevel').trim());

const args = process.argv.slice(2);
const audienceAt = args.indexOf('--audience');
const audience = audienceAt === -1 ? 'participant' : args[audienceAt + 1];
if (audienceAt !== -1) args.splice(audienceAt, 2);
const [locale, baseArg] = args;
if (!locale || locale === 'en') {
  fail('Name the language to translate into, as its catalog is named: to-translate.mjs sv');
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

function resolveBase(arg) {
  if (arg) {
    try {
      git('rev-parse', '--verify', `${arg}^{commit}`);
      return arg;
    } catch {
      fail(`"${arg}" isn't a commit git knows. Pass a branch, tag or commit, such as HEAD~1.`);
    }
  }
  for (const ref of ['origin/main', 'main']) {
    try {
      return git('merge-base', 'HEAD', ref).trim();
    } catch {
      // Not fetched here (a single-branch or shallow clone); try the next.
    }
  }
  fail('Found neither origin/main nor main. Run `git fetch origin main`, or pass a base.');
}

const base = resolveBase(baseArg);

/** A catalog's messages by full key (`participant.dialog.done`), in the audience's namespaces. */
function flatten(catalog) {
  const out = new Map();
  const walk = (value, prefix) => {
    if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) walk(child, `${prefix}.${key}`);
    } else out.set(prefix, value);
  };
  for (const namespace of namespaces) if (namespace in catalog) walk(catalog[namespace], namespace);
  return out;
}

const now = (code) => flatten(JSON.parse(readFileSync(catalogPath(code), 'utf8')));
/** The catalog at `base`, or nothing if it didn't exist then. */
const then = (code) => {
  try {
    return flatten(JSON.parse(git('show', `${base}:${catalogPath(code)}`)));
  } catch {
    return new Map();
  }
};

const english = now('en');
const englishBefore = then('en');
const own = now(locale);
const ownBefore = then(locale);

const found = [];
for (const [key, text] of english) {
  const translation = own.get(key);
  const was = englishBefore.get(key);
  if (translation === undefined) found.push({ status: 'missing', key, text });
  else if (was !== undefined && was !== text) {
    const status = ownBefore.get(key) === translation ? 'stale' : 'check';
    found.push({ status, key, text, was, translation });
  }
}
for (const [key, translation] of own) {
  if (!english.has(key)) found.push({ status: 'extra', key, translation });
}

const count = (status) => found.filter((item) => item.status === status).length;
console.log(
  `${locale}, ${audience} (${namespaces.join(', ')}): ${count('missing')} missing, ` +
    `${count('stale')} stale, ${count('check')} to check, ${count('extra')} extra ` +
    `(English compared with ${base.slice(0, 7)})`,
);
const show = (value) => JSON.stringify(value);
const label = (name) => `  ${`${name}:`.padEnd(9)}`;
let section = null;
for (const item of found.sort((a, b) => a.key.localeCompare(b.key))) {
  const parent = item.key.split('.').slice(0, -1).join('.');
  if (parent !== section) {
    section = parent;
    console.log(`\n## ${section}`);
  }
  console.log(`${item.status.padEnd(9)}${item.key}`);
  if (item.was !== undefined) console.log(`${label('en was')}${show(item.was)}`);
  if (item.text !== undefined) console.log(`${label('en')}${show(item.text)}`);
  if (item.translation !== undefined) console.log(`${label(locale)}${show(item.translation)}`);
}
