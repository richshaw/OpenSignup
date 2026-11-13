import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { CATALOG_LOCALES, SHIPPED } from './config';
import { type Catalog, checkCatalogs, loadCatalogs } from './testing/catalog-check';
import { createAppProgram, findUsedKeys } from './testing/used-keys';

/**
 * The catalog check over the real catalogs in src/messages/: see
 * ./testing/catalog-check.ts for what it checks and ./testing/used-keys.ts
 * for how it finds the keys the app uses.
 */
const ROOT = path.resolve(import.meta.dirname, '../..');

describe('the message catalogs', () => {
  let catalogs: Record<string, Catalog>;
  let found: ReturnType<typeof findUsedKeys>;

  beforeAll(() => {
    catalogs = loadCatalogs(path.join(ROOT, 'src/messages'));
    found = findUsedKeys(createAppProgram(ROOT), catalogs.en ?? {}, ROOT);
    // Builds a TypeScript program over src/, which takes a few seconds.
  }, 120_000);

  it('are the ones CATALOG_LOCALES lists', () => {
    expect(Object.keys(catalogs).sort()).toEqual([...CATALOG_LOCALES].sort());
  });

  it('pass the catalog check', () => {
    expect(checkCatalogs({ catalogs, shipped: SHIPPED, used: found.used })).toEqual([]);
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
