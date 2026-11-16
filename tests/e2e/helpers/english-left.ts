import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';
import compile from 'icu-minify/compile';
import { AUDIENCE_NAMESPACES } from '@/i18n/config';
import type { TestLocale } from '@/i18n/testing/locales';

type Catalog = { [key: string]: string | Catalog };

/** `<locale>.json`, as src/messages holds it. */
function catalogOf(locale: string): Catalog {
  return JSON.parse(
    readFileSync(path.join(process.cwd(), 'src', 'messages', `${locale}.json`), 'utf8'),
  ) as Catalog;
}

/** Every message under `catalog`, by its full key (`organizer.dashboard.title`). */
function messagesOf(catalog: Catalog, prefix = ''): [string, string][] {
  return Object.entries(catalog).flatMap(([key, value]): [string, string][] =>
    typeof value === 'string' ? [[prefix + key, value]] : messagesOf(value, `${prefix}${key}.`),
  );
}

// icu-minify's node types for a select, a plural and an ordinal, whose
// branches hold text. Its other typed nodes (numbers, dates) hold none.
const BRANCHED = new Set([1, 2, 3]);
const POUND = 0;

/**
 * The words a message writes itself, as the compiler that formats it reads
 * them: its text and its branches' and tags' text, without its placeholders'
 * names, its branch names or its tags' names.
 */
function textOf(message: string): string {
  const parts: string[] = [];
  const walk = (nodes: readonly unknown[]) => {
    for (const node of nodes) {
      if (typeof node === 'string') parts.push(node);
      if (!Array.isArray(node)) continue;
      const [, type, options] = node as [string, unknown, unknown];
      if (type === undefined) continue;
      if (typeof type !== 'number' || type === POUND) walk(node.slice(1));
      else if (BRANCHED.has(type)) {
        for (const branch of Object.values(options as Record<string, unknown>)) {
          walk(Array.isArray(branch) ? branch : [branch]);
        }
      }
    }
  };
  const compiled: unknown = compile(message);
  walk(Array.isArray(compiled) ? compiled : [compiled]);
  return parts.join(' ');
}

/**
 * `text`'s words of three letters or more, in lower case: a word is a run of
 * letters, so "didn’t" is "didn". Shorter ones ("of", "to") say too little
 * on their own, and an English message always has a longer one with them.
 */
function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{M}]+/u)
    .filter((word) => word.length >= 3);
}

const englishOnly = new Map<TestLocale, ReadonlySet<string>>();

/**
 * The words only English writes in the organizer's messages (`organizer`,
 * `auth` and `common`), as far as `locale`'s catalog says: words of the
 * English messages `locale` has its own message for, less any word `locale`
 * writes anywhere in its catalog ("Status" in Swedish too) and any word of
 * the English messages it has none for, which show in English on its pages,
 * as they should. So a word from this set on a page in `locale` is English
 * that should have been translated, and a catalog part-way through gets
 * checked only on what it has.
 */
function englishOnlyIn(locale: TestLocale): ReadonlySet<string> {
  const known = englishOnly.get(locale);
  if (known) return known;
  const own = catalogOf(locale);
  const ownKeys = new Set(messagesOf(own).map(([key]) => key));
  const ownWords = new Set(messagesOf(own).flatMap(([, message]) => wordsOf(textOf(message))));
  const english = catalogOf('en');
  const translated = new Set<string>();
  const untranslated = new Set<string>();
  for (const namespace of AUDIENCE_NAMESPACES.organizer) {
    for (const [key, message] of messagesOf({ [namespace]: english[namespace] ?? {} })) {
      for (const word of wordsOf(textOf(message))) {
        (ownKeys.has(key) ? translated : untranslated).add(word);
      }
    }
  }
  const words = new Set(
    [...translated].filter((word) => !untranslated.has(word) && !ownWords.has(word)),
  );
  englishOnly.set(locale, words);
  return words;
}

/**
 * The page's own text in `locale`: each piece of text, and each name, tip
 * and placeholder an element carries, whose nearest `lang` is `locale`. What
 * a signup says in another language is marked with it, and left out.
 * Hidden text counts too, such as a phone's copy of a control on a
 * computer, since it's the page's text all the same.
 */
function ownTextIn(page: Page, locale: TestLocale): Promise<string[]> {
  return page.evaluate((locale) => {
    const inLocale = (element: Element) =>
      !element.closest('script, style, noscript, template') &&
      element.closest('[lang]')?.getAttribute('lang') === locale;
    const texts: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      if (text && node.parentElement && inLocale(node.parentElement)) texts.push(text);
    }
    const named = '[aria-label], [title], [placeholder], [alt], [aria-placeholder]';
    for (const element of document.body.querySelectorAll(named)) {
      if (!inLocale(element)) continue;
      for (const name of ['aria-label', 'title', 'placeholder', 'alt', 'aria-placeholder']) {
        const text = element.getAttribute(name)?.trim();
        if (text) texts.push(text);
      }
    }
    return [...new Set(texts)];
  }, locale);
}

/**
 * Checks the page's own text in `locale` (its organizer's language) has no
 * English left where `locale`'s catalog has a message: no word only English
 * writes (`englishOnlyIn`). `ignore` is text the page shows that isn't its
 * own, such as a signup's title, slots and field names, which are in the
 * signup's language, and aren't marked where they sit inside a sentence of
 * the page's ("Set what"). A web address or an email address is left out
 * too, since it's whatever it is in every language.
 */
export async function expectNoEnglishLeft(
  page: Page,
  locale: TestLocale,
  { ignore = [] }: { ignore?: readonly string[] } = {},
): Promise<void> {
  const english = englishOnlyIn(locale);
  const ignored = new Set(ignore.flatMap(wordsOf));
  const found: string[] = [];
  for (const text of await ownTextIn(page, locale)) {
    const words = text
      .split(/\s+/)
      .filter((chunk) => !/[@/]/.test(chunk))
      .join(' ');
    const left = [...new Set(wordsOf(words))].filter(
      (word) => english.has(word) && !ignored.has(word),
    );
    if (left.length > 0) found.push(`${JSON.stringify(text)}: ${left.join(', ')}`);
  }
  expect(found, `English left on ${new URL(page.url()).pathname} in ${locale}`).toEqual([]);
}

/**
 * Every word of the signed-in organizer's own signups, through the
 * organizer API: their titles, descriptions, fields' names and choices, and
 * slots' values. They're in each signup's language, whatever the
 * organizer's, so `expectNoEnglishLeft` leaves them out.
 */
export async function signupWords(page: Page): Promise<string[]> {
  const listed = await page.request.get('/api/signups');
  expect(listed.ok(), 'GET /api/signups').toBe(true);
  const { data } = (await listed.json()) as { data: { id: string }[] };
  const words: string[] = [];
  for (const { id } of data) {
    const response = await page.request.get(`/api/signups/${id}`);
    expect(response.ok(), `GET /api/signups/${id}`).toBe(true);
    const { data: signup } = (await response.json()) as {
      data: {
        title: string;
        description: string | null;
        fields: { label: string; config: { choices?: string[]; unit?: string } }[];
        slots: { values: Record<string, unknown> }[];
      };
    };
    words.push(signup.title, signup.description ?? '');
    for (const field of signup.fields) {
      words.push(field.label, ...(field.config.choices ?? []), field.config.unit ?? '');
    }
    for (const slot of signup.slots) {
      words.push(...Object.values(slot.values).filter((v): v is string => typeof v === 'string'));
    }
  }
  return words;
}
