import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { CATALOG_LOCALES, SHIPPED } from './config';
import {
  type Catalog,
  catalogNotes,
  checkCatalogs,
  loadCatalogs,
  type TranslatedFrom,
} from './testing/catalog-check';
import { loadTranslatedFrom, TRANSLATED_FROM_DIR } from './testing/translated-from';
import { findUsedKeys } from './testing/used-keys';

/**
 * The catalog check over the real catalogs in src/messages/, and each
 * language's record of the English it was translated from in
 * src/i18n/translated-from/: see ./testing/catalog-check.ts for what it
 * checks and ./testing/used-keys.ts for how it finds the keys the app uses.
 */
const ROOT = path.resolve(import.meta.dirname, '../..');

describe('the message catalogs', () => {
  let catalogs: Record<string, Catalog>;
  let translatedFrom: Record<string, TranslatedFrom>;
  let found: ReturnType<typeof findUsedKeys>;

  beforeAll(() => {
    catalogs = loadCatalogs(path.join(ROOT, 'src/messages'));
    translatedFrom = loadTranslatedFrom(path.join(ROOT, TRANSLATED_FROM_DIR));
    // Builds a TypeScript program over src/, which takes a few seconds. It
    // types translators against the en.json just loaded, so a stale
    // en.d.json.ts (messages-declaration.test.ts) can't confuse the check.
    found = findUsedKeys(ROOT, catalogs.en ?? {});
  }, 120_000);

  it('are the ones CATALOG_LOCALES lists', () => {
    expect(Object.keys(catalogs).sort()).toEqual([...CATALOG_LOCALES].sort());
  });

  it('pass the catalog check', () => {
    expect(checkCatalogs({ catalogs, shipped: SHIPPED, used: found.used, translatedFrom })).toEqual(
      [],
    );
  });

  it("report what a language that hasn't shipped needs translated again", () => {
    // Stale messages fail a language once it ships. Until then they're told
    // here, so a change to English can bring its translations along.
    const notes = catalogNotes({ catalogs, shipped: SHIPPED, translatedFrom });
    if (notes.length > 0) {
      console.warn(
        [
          'Translations out of date (not failing, as these languages have not shipped):',
          ...notes.map((note) => `  ${note}`),
          'Update them with the translate skill (to-translate.mjs <language> lists them).',
        ].join('\n'),
      );
    }
  });

  it('are read with keys the check can see', () => {
    expect(found.unresolved).toEqual([]);
  });
});

describe('icu-minify', () => {
  // The check compiles with its own copy, so it must be the one next-intl and
  // use-intl run: package.json pins it, and pnpm.overrides pins theirs.
  it('is the copy next-intl and use-intl load', () => {
    const resolveFrom = (dir: string) =>
      realpathSync(createRequire(path.join(dir, 'package.json')).resolve('icu-minify/compile'));
    const ours = resolveFrom(ROOT);
    for (const name of ['next-intl', 'use-intl']) {
      expect(resolveFrom(realpathSync(path.join(ROOT, 'node_modules', name))), name).toBe(ours);
    }
  });
});
