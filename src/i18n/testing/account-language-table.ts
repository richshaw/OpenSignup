import { readFileSync } from 'node:fs';
import { CATALOG_LOCALES, type CatalogLocale } from '../config';

/**
 * One row of the decision table in docs/translating.md ("An organizer's
 * language"): what a new account stores, and the language it gets.
 */
export interface AccountLanguageRow {
  /** The row's first two cells as the doc writes them, for a test's name. */
  label: string;
  /** The site's `DEFAULT_LOCALE`, or undefined for "none". */
  instanceDefault: CatalogLocale | undefined;
  /** `Accept-Language` headers whose top language is the row's (null: no header). */
  headers: (string | null)[];
  /** What the account stores, or null for "nothing". */
  stored: CatalogLocale | null;
  /** The language the account then gets. */
  gets: CatalogLocale;
}

const DOC = new URL('../../../docs/translating.md', import.meta.url);
const HEADING = "### An organizer's language";

/** Headers that name no language: none at all, an empty one, the wildcard, and junk. */
const NO_LANGUAGE = [null, '', '*', ';q=x', 'sv_SE', '<script>'];

/**
 * The decision table as docs/translating.md has it, read from the doc itself,
 * so the tests run the rule the self-hoster reads and a change to either side
 * fails until the other matches. Throws on a cell it can't read, so a row
 * reworded out of the table's shape fails loudly rather than being skipped.
 */
export function accountLanguageTable(): AccountLanguageRow[] {
  const doc = readFileSync(DOC, 'utf8');
  const start = doc.indexOf(HEADING);
  if (start === -1) throw new Error(`no "${HEADING}" in docs/translating.md`);
  const section = doc.slice(start + HEADING.length).split(/\n#{1,3} /)[0] ?? '';
  const lines = section.split('\n').filter((line) => line.startsWith('|'));
  // The header row and the line under it.
  return lines.slice(2).map((line) => {
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length !== 4) throw new Error(`a row without four cells: ${line}`);
    const [siteDefault = '', browser = '', stored = '', gets = ''] = cells;
    return {
      label: `site default ${siteDefault}, browser ${browser}`,
      instanceDefault: siteDefault === 'none' ? undefined : catalogLanguage(siteDefault),
      headers: browser.startsWith('none') ? NO_LANGUAGE : asksFirstFor(language(browser)),
      stored: stored === 'nothing' ? null : catalogLanguage(stored),
      gets: catalogLanguage(gets),
    };
  });
}

/** Headers that ask for `language` first, alone and ahead of others. */
function asksFirstFor(language: string): string[] {
  return [language, `${language}-ZZ,de;q=0.9,en;q=0.8,sv;q=0.7`];
}

/** The language code in a cell, as the doc writes one: `sv`. */
function language(cell: string): string {
  const code = /^`([a-z]{2,3})`/.exec(cell)?.[1];
  if (!code) throw new Error(`no language code in "${cell}"`);
  return code;
}

function catalogLanguage(cell: string): CatalogLocale {
  const code = language(cell);
  if (!(CATALOG_LOCALES as readonly string[]).includes(code)) {
    throw new Error(`"${cell}" isn't a language with a catalog`);
  }
  return code as CatalogLocale;
}
