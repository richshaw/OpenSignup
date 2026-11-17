import { describe, expect, it } from 'vitest';
import { getTestTranslator } from '@/i18n/testing/translator';
import type { Namespace } from '@/i18n/translator';
import { HELP_ARTICLES } from './articles';
import { HELP_BODIES, type HelpBody } from './bodies';

type FromCatalog = Exclude<HelpBody['fromCatalog'][string], readonly unknown[] | null>;

/** The message at `source`'s full key in English, formatted with its values. */
function englishOf(source: FromCatalog): { key: string; text: string } {
  const { key, values } = typeof source === 'string' ? { key: source, values: {} } : source;
  const cut = key.lastIndexOf('.');
  const t = getTestTranslator(key.slice(0, cut) as Namespace) as unknown as (
    key: string,
    values: Readonly<Record<string, string>>,
  ) => string;
  return { key, text: t(key.slice(cut + 1), values) };
}

/**
 * Each help article prints the names of the controls it tells an organizer to
 * use (`UI` in its `.ui.ts`), and its walkthrough finds them by those names,
 * in English. The controls' text comes from the catalog, so each name says
 * where (`FROM_CATALOG`, beside it), and this checks the name is still what
 * the catalog's English says: rewording a message fails here, naming the
 * article whose name to change, before the walkthrough has to.
 */
describe.each(HELP_ARTICLES.map(({ slug }) => slug))('the help article %s', (slug) => {
  it('names each control as the catalog’s English does', () => {
    const { ui, fromCatalog } = HELP_BODIES[slug];
    expect(Object.keys(fromCatalog).sort(), 'FROM_CATALOG has an entry for each name').toEqual(
      Object.keys(ui).sort(),
    );

    const differ: string[] = [];
    for (const [name, sources] of Object.entries(fromCatalog)) {
      if (sources === null) continue;
      const list: readonly FromCatalog[] = Array.isArray(sources)
        ? sources
        : [sources as FromCatalog];
      for (const source of list) {
        const { key, text } = englishOf(source);
        if (text !== ui[name]) differ.push(`UI.${name} is "${ui[name]}", but ${key} is "${text}"`);
      }
    }
    expect(
      differ,
      `change these in src/help/articles/${slug}.ui.ts, and reread the article`,
    ).toEqual([]);
  });
});
