/**
 * Each language's record of the English its messages were translated from:
 * `src/i18n/translated-from/<language>.json`, one for each catalog but
 * English's. It maps a message's full key (`participant.dialog.done`) to the
 * English text it was translated from, in en.json's order.
 *
 * The catalog check (./catalog-check.ts) compares it with en.json, so a
 * translation whose English has changed since is caught as stale. The
 * `translate` skill's scripts list what's stale from it (`to-translate.mjs`)
 * and write it once a message is translated (`mark-translated.mjs`). Nothing
 * else reads it: no module in the app or the worker imports it. It sits
 * outside src/messages/, where next-intl reads every JSON file as a
 * language, and outside any path starting `src/messages`, which its catalog
 * loader takes in (next.config.mjs).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { type Catalog, messagesIn, type TranslatedFrom } from './catalog-check';

/** Where the records are, from the repo's root. */
export const TRANSLATED_FROM_DIR = 'src/i18n/translated-from';

/** Every `<locale>.json` in `dir`, by locale; none if there's no `dir`. */
export function loadTranslatedFrom(dir: string): Record<string, TranslatedFrom> {
  const records: Record<string, TranslatedFrom> = {};
  if (!existsSync(dir)) return records;
  for (const file of readdirSync(dir)) {
    const locale = /^([^.]+)\.json$/.exec(file)?.[1];
    if (!locale) continue;
    const record: unknown = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
    const isText = ([, value]: [string, unknown]) => typeof value === 'string';
    if (
      typeof record !== 'object' ||
      record === null ||
      Array.isArray(record) ||
      !Object.entries(record).every(isText)
    ) {
      throw new Error(
        `${path.join(dir, file)} should map each key to the English it was translated from, as text`,
      );
    }
    records[locale] = record as TranslatedFrom;
  }
  return records;
}

/**
 * The record once the messages `names` lists have been translated from
 * today's English: each name is a full key, or a section or namespace
 * (`participant.dialog`, `email`) for every message under it.
 *
 * Each named message the translation has gets English's text now. Every other
 * entry stays as it was, so a stale one stays stale, except one for a message
 * English or the translation no longer has, which goes. The result is in
 * en.json's order. Also says what changed, and which names match no English
 * message (a typo, most likely).
 */
export function markTranslated(
  english: Catalog,
  catalog: Catalog,
  record: TranslatedFrom,
  names: readonly string[],
): {
  record: Record<string, string>;
  /** Named messages whose entry changed, each with what it said before, if anything. */
  marked: { key: string; was: string | undefined }[];
  /** Named messages the translation doesn't have yet. */
  untranslated: string[];
  /** Entries for a message English or the translation doesn't have. */
  dropped: string[];
  unknown: string[];
} {
  const sourceText = messagesIn(english);
  const translated = messagesIn(catalog);
  const covers = (name: string, key: string) => key === name || key.startsWith(`${name}.`);
  const unknown = names.filter((name) => ![...sourceText.keys()].some((key) => covers(name, key)));

  const next: Record<string, string> = {};
  const marked: { key: string; was: string | undefined }[] = [];
  const untranslated: string[] = [];
  for (const [key, text] of sourceText) {
    const was = Object.hasOwn(record, key) ? record[key] : undefined;
    const named = names.some((name) => covers(name, key));
    if (!translated.has(key)) {
      if (named) untranslated.push(key);
    } else if (named) {
      next[key] = text;
      if (was !== text) marked.push({ key, was });
    } else if (was !== undefined) next[key] = was;
  }
  const dropped = Object.keys(record).filter((key) => !Object.hasOwn(next, key));
  return { record: next, marked, untranslated, dropped, unknown };
}
