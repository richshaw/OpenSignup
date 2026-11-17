import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, type Locator } from '@playwright/test';
import { AUDIENCE_NAMESPACES } from '@/i18n/config';
import { englishName, type TestLocale } from '@/i18n/testing/locales';

/**
 * The English the participant and organizer screens showed, none of which a
 * translated page may keep: the participant pages' words, then the organizer
 * app's buttons, tabs and statuses, and words any English sentence has.
 */
const ENGLISH_WORDS = [
  'Your',
  'You',
  'Save',
  'Saving',
  'Cancel',
  'Keep',
  'Yes',
  'Back',
  'Reminders',
  'Stop',
  'Turn',
  'signup',
  'spots?',
  'slot',
  'link',
  'Sorry',
  'Publish',
  'Share',
  'Preview',
  'Build',
  'Responses',
  'Settings',
  'Fields',
  'Duplicate',
  'Delete',
  'Done',
  'Remove',
  'Help',
  'Account',
  'Copy',
  'Download',
  'Draft',
  'draft',
  'Close',
  'Reopen',
  'people',
  'Add',
  'New',
  'Create',
  'Edit',
  'Sign',
  'the',
  'and',
  'you',
  'your',
] as const;

/**
 * The words in `ENGLISH_WORDS` a language writes as its own too (Dutch says
 * "link" and "Sorry"), which its pages may show. A language without an entry
 * shares none. Add a word on purpose, once you know the language says it:
 * never to quiet a message left in English, which is what the check is for.
 */
const SHARED_WITH_ENGLISH: {
  readonly [L in TestLocale]?: readonly (typeof ENGLISH_WORDS)[number][];
} = {
  sv: [],
};

/** `ENGLISH_WORDS` as a pattern, less the words `SHARED_WITH_ENGLISH` gives the language. */
function englishLeftIn(locale: TestLocale): RegExp {
  const shared: readonly string[] = SHARED_WITH_ENGLISH[locale] ?? [];
  const english = ENGLISH_WORDS.filter((word) => !shared.includes(word));
  // With no word left, the pattern would match any text and fail every page.
  if (english.length === 0) {
    throw new Error(
      `SHARED_WITH_ENGLISH gives ${locale} every word in ENGLISH_WORDS: add English words it doesn't use`,
    );
  }
  return new RegExp(`\\b(${english.join('|')})\\b`);
}

/**
 * Where the language's own catalog writes a word the pattern looks for, in
 * the namespaces `audience` reads, the likeliest reason a page fails the
 * check, as the start of its failure. Undefined when it writes none. ICU's
 * syntax doesn't count (argument names, `plural` and the like, branch names
 * and tags), so `{slot}` isn't "slot".
 */
function englishInCatalog(
  locale: TestLocale,
  english: RegExp,
  audience: 'participant' | 'organizer',
): string | undefined {
  const catalog = JSON.parse(
    readFileSync(path.join(process.cwd(), 'src', 'messages', `${locale}.json`), 'utf8'),
  ) as Record<string, unknown>;
  const found: string[] = [];
  const look = (value: unknown, key: string): void => {
    if (typeof value !== 'string') {
      for (const [name, inner] of Object.entries(value as object)) look(inner, `${key}.${name}`);
      return;
    }
    const text = value
      .replace(/<\/?[\w-]+>/g, ' ')
      .replace(/\{\s*[\w-]+\s*(,\s*\w+\s*(,[^{}]*)?)?/g, ' ')
      .replace(/(=\d+|\b\w+)\s*\{/g, ' ');
    const words = [...new Set(text.match(new RegExp(english.source, 'g')))];
    if (words.length > 0) found.push(`${key} (${words.map((word) => `"${word}"`).join(', ')})`);
  };
  for (const namespace of AUDIENCE_NAMESPACES[audience]) {
    look(catalog[namespace] ?? {}, namespace);
  }
  if (found.length === 0) return undefined;
  const named = found.length > 5 ? [...found.slice(0, 5), `${found.length - 5} more`] : found;
  return `English on the page. ${locale}.json writes it in ${named.join(', ')}: translate each message, or add a word ${englishName(locale)} says too to SHARED_WITH_ENGLISH in tests/e2e/helpers/no-english.ts`;
}

/**
 * The no-English check for `locale`'s pages that `audience` reads: it fails
 * when the part of a page given to it shows a word of `ENGLISH_WORDS` the
 * language doesn't share (`SHARED_WITH_ENGLISH`), and names the catalog's
 * messages that write one. Give it only what's in `locale`: a signup's own
 * words in another language aren't the page's to translate.
 */
export function noEnglishCheck(
  locale: TestLocale,
  audience: 'participant' | 'organizer',
): (target: Locator) => Promise<void> {
  const english = englishLeftIn(locale);
  const leftInCatalog = englishInCatalog(locale, english, audience);
  // Both ways: textContent runs one element's text into the next ("…listanYour
  // spot…"), so `\b` misses a word at an element's edge, and innerText leaves
  // out what nobody sees.
  return async (target) => {
    await expect(target, leftInCatalog).not.toHaveText(english);
    await expect(target, leftInCatalog).not.toHaveText(english, { useInnerText: true });
  };
}
