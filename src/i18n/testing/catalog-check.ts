/**
 * The catalog check that src/i18n/catalogs.test.ts runs over src/messages/,
 * kept out of the test so fixture tests can run it on catalogs of their own.
 *
 * English (`en.json`) is the source. For every catalog it checks:
 *
 * - every message compiles with icu-minify, the compiler next-intl uses;
 * - a translation has the same placeholders, tags and select branches as its
 *   English, and takes the same kind of value for each placeholder;
 * - a translation has no key English lacks;
 * - completeness per namespace against English, which must be whole for each
 *   audience a language is shipped to (`SHIPPED` in src/i18n/config.ts);
 * - against the language's record of the English each message was translated
 *   from (./translated-from.ts), that no message is stale: translated from
 *   English that has changed since, or with no record of what it was
 *   translated from. Like completeness, that fails only where the language is
 *   shipped; elsewhere `catalogNotes` reports it. An entry the record doesn't
 *   need fails in every language;
 * - every English message is used by the app (`findUsedKeys` in ./used-keys).
 *
 * Each problem comes back as one line, `<locale> <key>: <what's wrong>`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import compile from 'icu-minify/compile';
import { AUDIENCE_NAMESPACES, type Audience } from '../config';

export type Catalog = { [key: string]: string | Catalog };

/**
 * A language's record of the English each of its messages was translated
 * from, by full key (`participant.dialog.done`): the file in
 * src/i18n/translated-from/ (./translated-from.ts).
 */
export type TranslatedFrom = { readonly [key: string]: string };

/** Every `<locale>.json` in `dir`, by locale. */
export function loadCatalogs(dir: string): Record<string, Catalog> {
  const catalogs: Record<string, Catalog> = {};
  for (const file of readdirSync(dir)) {
    const locale = /^([^.]+)\.json$/.exec(file)?.[1];
    if (locale) catalogs[locale] = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
  }
  return catalogs;
}

export function checkCatalogs({
  catalogs,
  shipped,
  used,
  translatedFrom,
}: {
  catalogs: Readonly<Record<string, Catalog>>;
  shipped: Readonly<Record<Audience, readonly string[]>>;
  /** Every key the app uses, in full (`common.footer.help`). */
  used: ReadonlySet<string>;
  /** Each translated language's record of the English it was translated from. */
  translatedFrom: Readonly<Record<string, TranslatedFrom>>;
}): string[] {
  const problems: string[] = [];
  const english = catalogs.en;
  if (!english) return ['en: there is no English catalog'];

  const readers = new Set<string>(Object.values(AUDIENCE_NAMESPACES).flat());
  for (const namespace of Object.keys(english)) {
    if (!readers.has(namespace)) {
      problems.push(
        `en ${namespace}: no audience reads this namespace; add it to AUDIENCE_NAMESPACES in src/i18n/config.ts`,
      );
    }
  }

  const source = new Map<string, Shape>();
  for (const [key, message] of messagesOf('en', english, problems)) {
    const shape = shapeOf('en', key, message, problems);
    if (shape) source.set(key, shape);
    if (!used.has(key)) {
      problems.push(`en ${key}: nothing in src/ uses it; delete it from every catalog`);
    }
  }

  for (const [locale, catalog] of Object.entries(catalogs)) {
    if (locale === 'en') continue;
    for (const [key, message] of messagesOf(locale, catalog, problems)) {
      if (messageAt(english, key) === undefined) {
        problems.push(`${locale} ${key}: not in en.json; delete it`);
        continue;
      }
      const shape = shapeOf(locale, key, message, problems);
      const englishShape = source.get(key);
      if (!shape || !englishShape) continue;
      for (const difference of differences(englishShape, shape)) {
        problems.push(`${locale} ${key}: ${difference}`);
      }
    }

    const required = requiredNamespaces(locale, shipped);
    for (const [namespace, { missing }] of Object.entries(completeness(english, catalog))) {
      const audiences = required.get(namespace);
      if (!audiences) continue;
      for (const key of missing) {
        const lists = audiences.map((audience) => `SHIPPED.${audience}`).join(' and ');
        problems.push(`${locale} ${key}: missing, but ${locale} is in ${lists}`);
      }
    }
  }
  for (const { line, fails } of recordLines(catalogs, shipped, translatedFrom)) {
    if (fails) problems.push(line);
  }
  return problems;
}

/**
 * What the check finds in a language's record that doesn't fail it: a stale
 * message, or one with no record, in a namespace the language hasn't shipped
 * to an audience in. Lines like `checkCatalogs`'s, for the catalog test to
 * print as a warning. (The `translate` skill's to-translate.mjs lists the
 * same messages from `recordFindings`, with their text.)
 */
export function catalogNotes({
  catalogs,
  shipped,
  translatedFrom,
}: {
  catalogs: Readonly<Record<string, Catalog>>;
  shipped: Readonly<Record<Audience, readonly string[]>>;
  translatedFrom: Readonly<Record<string, TranslatedFrom>>;
}): string[] {
  return recordLines(catalogs, shipped, translatedFrom)
    .filter(({ fails }) => !fails)
    .map(({ line }) => line);
}

/**
 * Every finding in every language's record, as a line, and whether it fails
 * the check: a stale or unrecorded message fails where the language is
 * shipped to an audience that reads its namespace, as a missing one does; an
 * entry the record doesn't need fails everywhere, as a key English lacks does.
 */
function recordLines(
  catalogs: Readonly<Record<string, Catalog>>,
  shipped: Readonly<Record<Audience, readonly string[]>>,
  translatedFrom: Readonly<Record<string, TranslatedFrom>>,
): { line: string; fails: boolean }[] {
  const english = catalogs.en;
  if (!english) return [];
  const lines: { line: string; fails: boolean }[] = [];
  for (const locale of Object.keys(translatedFrom)) {
    if (locale === 'en' || !catalogs[locale]) {
      const line = `${locale}: there's a record of what ${locale} was translated from, but no ${locale} translation; delete the record`;
      lines.push({ line, fails: true });
    }
  }
  for (const [locale, catalog] of Object.entries(catalogs)) {
    if (locale === 'en') continue;
    const required = requiredNamespaces(locale, shipped);
    for (const finding of recordFindings(english, catalog, translatedFrom[locale] ?? {})) {
      const { key } = finding;
      if (finding.status === 'unneeded') {
        const lacks = finding.lacking === 'english' ? 'en.json' : `${locale}.json`;
        const line = `${locale} ${key}: recorded as translated, but ${lacks} doesn't have it; the translate skill's mark-translated.mjs ${locale} drops it`;
        lines.push({ line, fails: true });
        continue;
      }
      const what =
        finding.status === 'stale'
          ? 'stale: its English changed after it was translated'
          : 'no record of the English it was translated from';
      const audiences = required.get(key.split('.')[0] ?? key);
      if (audiences) {
        const lists = audiences.map((audience) => `SHIPPED.${audience}`).join(' and ');
        lines.push({
          line: `${locale} ${key}: ${what}, but ${locale} is in ${lists}`,
          fails: true,
        });
      } else {
        lines.push({ line: `${locale} ${key}: ${what}`, fails: false });
      }
    }
  }
  return lines;
}

/** What a language's record says about one of its messages, where that's anything but "up to date". */
export type RecordFinding =
  /** Translated from `recorded`, which isn't what English says now. */
  | { key: string; status: 'stale'; recorded: string }
  /** Translated, but the record doesn't say from what. */
  | { key: string; status: 'unrecorded' }
  /** In the record, but English or the translation no longer has the message. */
  | { key: string; status: 'unneeded'; lacking: 'english' | 'translation' };

/**
 * Compares a language's record (`TranslatedFrom`) with English as it is now:
 * each translated message whose English has changed since it was translated
 * (stale) or that the record lacks (unrecorded), and each entry in the record
 * for a message English or the translation doesn't have (unneeded). A message
 * English doesn't have is left to the check's "not in en.json" problem.
 */
export function recordFindings(
  english: Catalog,
  catalog: Catalog,
  record: TranslatedFrom,
): RecordFinding[] {
  const findings: RecordFinding[] = [];
  for (const key of messagesIn(catalog).keys()) {
    const source = messageAt(english, key);
    if (source === undefined) continue;
    // A record is parsed JSON, so ask for its own keys only.
    const recorded = Object.hasOwn(record, key) ? record[key] : undefined;
    if (recorded === undefined) findings.push({ key, status: 'unrecorded' });
    else if (recorded !== source) findings.push({ key, status: 'stale', recorded });
  }
  for (const key of Object.keys(record)) {
    if (messageAt(english, key) === undefined) {
      findings.push({ key, status: 'unneeded', lacking: 'english' });
    } else if (messageAt(catalog, key) === undefined) {
      findings.push({ key, status: 'unneeded', lacking: 'translation' });
    }
  }
  return findings;
}

/** A catalog's messages by full key (`common.footer.help`), in the catalog's order. */
export function messagesIn(catalog: Catalog): Map<string, string> {
  return messagesOf('', catalog, []);
}

/**
 * For each of English's namespaces, how many messages it has and which of
 * them `catalog` lacks. Known for every catalog; enforced only where the
 * language is shipped.
 */
export function completeness(
  english: Catalog,
  catalog: Catalog,
): Record<string, { total: number; missing: string[] }> {
  const result: Record<string, { total: number; missing: string[] }> = {};
  for (const [key] of messagesOf('en', english, [])) {
    const namespace = key.split('.')[0] ?? key;
    const entry = (result[namespace] ??= { total: 0, missing: [] });
    entry.total += 1;
    if (messageAt(catalog, key) === undefined) entry.missing.push(key);
  }
  return result;
}

/** The namespaces `locale` must be complete in, each with the audiences that need it. */
function requiredNamespaces(
  locale: string,
  shipped: Readonly<Record<Audience, readonly string[]>>,
): Map<string, Audience[]> {
  const required = new Map<string, Audience[]>();
  for (const audience of Object.keys(AUDIENCE_NAMESPACES) as Audience[]) {
    if (!shipped[audience].includes(locale)) continue;
    for (const namespace of AUDIENCE_NAMESPACES[audience]) {
      required.set(namespace, [...(required.get(namespace) ?? []), audience]);
    }
  }
  return required;
}

/** A catalog's messages by full key, reporting any value that is neither a message nor a section. */
function messagesOf(locale: string, catalog: unknown, problems: string[]): Map<string, string> {
  const messages = new Map<string, string>();
  const walk = (value: unknown, prefix: string): void => {
    if (!isSection(value)) {
      if (typeof value === 'string') messages.set(prefix, value);
      else problems.push(`${locale} ${prefix}: not a message or a section of messages`);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      // next-intl reads a dot as nesting, so a key with one can't be reached.
      if (key.includes('.')) problems.push(`${locale} ${prefix}: the key "${key}" has a dot in it`);
      else walk(child, prefix ? `${prefix}.${key}` : key);
    }
  };
  walk(catalog, '');
  return messages;
}

function messageAt(catalog: Catalog, key: string): string | undefined {
  let value: unknown = catalog;
  for (const part of key.split('.')) value = isSection(value) ? value[part] : undefined;
  return typeof value === 'string' ? value : undefined;
}

const isSection = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The kind of value a placeholder takes from the code. */
type ValueKind = 'text' | 'number' | 'date';

/** What a message needs from the code that formats it. */
type Shape = {
  placeholders: Map<string, Set<ValueKind>>;
  tags: Set<string>;
  /** Each select's branch names, by its placeholder. */
  branches: Map<string, Set<string>>;
};

// The node types in icu-minify's compiled messages (its dist/types/types.d.ts,
// which it doesn't export). A node is `[name]` for a plain placeholder,
// `[name, type, …]` for these, and `[name, ...children]` for a tag.
const POUND = 0;
const SELECT = 1;
const PLURAL = 2;
const SELECTORDINAL = 3;
const KINDS: Record<number, ValueKind> = {
  [SELECT]: 'text',
  [PLURAL]: 'number',
  [SELECTORDINAL]: 'number',
  4: 'number',
  5: 'date',
  6: 'date',
};

/** Compiles `message` and reads its shape from the result, or reports why it doesn't compile. */
function shapeOf(locale: string, key: string, message: string, problems: string[]): Shape | null {
  let compiled: unknown;
  try {
    compiled = compile(message);
  } catch (error) {
    problems.push(`${locale} ${key}: doesn't compile (${(error as Error).message})`);
    return null;
  }
  const shape: Shape = { placeholders: new Map(), tags: new Set(), branches: new Map() };
  if (Array.isArray(compiled)) addNodes(compiled, shape);
  return shape;
}

function addNodes(nodes: readonly unknown[], shape: Shape): void {
  for (const node of nodes) addNode(node, shape);
}

function addNode(node: unknown, shape: Shape): void {
  // Text, or a plural's `#`.
  if (!Array.isArray(node)) return;
  const [name, type, ...rest] = node as [string, unknown, ...unknown[]];
  if (type === undefined) return addTo(shape.placeholders, name, ['text']);
  if (typeof type !== 'number' || type === POUND) {
    shape.tags.add(name);
    return addNodes(node.slice(1), shape);
  }
  const kind = KINDS[type];
  if (!kind)
    throw new Error(`icu-minify compiled a node of a type this check doesn't know: ${type}`);
  addTo(shape.placeholders, name, [kind]);
  if (type === SELECT || type === PLURAL || type === SELECTORDINAL) {
    const options = rest[0] as Record<string, unknown>;
    // A plural's categories differ by language (Swedish has two, Polish four); a select's don't.
    if (type === SELECT) addTo(shape.branches, name, Object.keys(options));
    for (const branch of Object.values(options)) if (Array.isArray(branch)) addNodes(branch, shape);
  }
}

function addTo<T>(map: Map<string, Set<T>>, name: string, values: readonly T[]): void {
  const set = map.get(name) ?? new Set<T>();
  for (const value of values) set.add(value);
  map.set(name, set);
}

/** The kinds of value a placeholder can take, given the value English is passed for it. */
const ACCEPTS: Record<ValueKind, readonly ValueKind[]> = {
  date: ['date'],
  number: ['number', 'text'],
  text: ['text'],
};

const NAMED: Record<ValueKind, string> = { text: 'text', number: 'a number', date: 'a date' };

/** How a translation's shape differs from its English one, in ways that break it or lose text. */
function differences(english: Shape, own: Shape): string[] {
  const found: string[] = [];
  for (const name of english.placeholders.keys()) {
    if (!own.placeholders.has(name)) found.push(`drops {${name}}`);
  }
  for (const [name, kinds] of own.placeholders) {
    const englishKinds = english.placeholders.get(name);
    if (!englishKinds) {
      found.push(`has {${name}}, which English doesn't`);
      continue;
    }
    // TypeScript checks the code against English, so English decides the value it's passed.
    const passed = englishKinds.has('date')
      ? 'date'
      : englishKinds.has('number')
        ? 'number'
        : 'text';
    for (const kind of kinds) {
      if (!ACCEPTS[passed].includes(kind)) {
        found.push(`{${name}} is ${NAMED[kind]} here but ${NAMED[passed]} in English`);
      }
    }
  }
  for (const tag of english.tags) if (!own.tags.has(tag)) found.push(`drops <${tag}>`);
  for (const tag of own.tags)
    if (!english.tags.has(tag)) found.push(`has <${tag}>, which English doesn't`);
  for (const [name, branches] of english.branches) {
    const ownBranches = own.branches.get(name);
    if (!ownBranches) {
      // Shown as it is, {name} gives the code's value (`open`), not a word for it. A
      // translation without {name} at all is already reported as dropping it.
      if (own.placeholders.has(name))
        found.push(`{${name}} isn't a select here, but is in English`);
    } else if (!sameMembers(branches, ownBranches)) {
      found.push(
        `{${name}, select} has branches ${[...ownBranches].join(', ')} here but ${[...branches].join(', ')} in English`,
      );
    }
  }
  return found;
}

const sameMembers = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  a.size === b.size && [...a].every((value) => b.has(value));
