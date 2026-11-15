import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * `opensignup/no-catalogs-in-client`, the local rule in eslint.config.mjs that
 * keeps the catalogs, and the translators that import them all, out of client
 * bundles. Run through the repo's own config, so these also prove the rule is
 * on for the app's files.
 */
const RULE = 'opensignup/no-catalogs-in-client';
const eslint = new ESLint({ cwd: resolve(import.meta.dirname, '../..') });

async function lint(code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: 'src/components/example.tsx' });
  // A fixture that doesn't parse would pass every rule without being looked at.
  const fatal = result?.messages.find((message) => message.fatal);
  if (fatal) throw new Error(`fixture doesn't parse: ${fatal.message}`);
  return (result?.messages ?? [])
    .filter((message) => message.ruleId === RULE)
    .map((message) => message.message);
}

const CLIENT = "'use client';\n";

/** Imports that bring every language's messages, or a whole catalog, with them. */
const FORBIDDEN = [
  ['the translator', "import { getTranslator } from '@/i18n/translator';"],
  ['the server translator', "import { getServerTranslator } from '@/i18n/server';"],
  ['the test translator', "import { getTestTranslator } from '@/i18n/testing/translator';"],
  ['a catalog', "import en from '@/messages/en.json';"],
  ['a catalog that comes later', "import sv from '@/messages/sv.json';"],
  ['the translator by a relative path', "import { getTranslator } from '../i18n/translator';"],
  ['a catalog by a relative path', "import en from '../messages/en.json';"],
  [
    'a catalog with an import attribute',
    "import en from '@/messages/en.json' with { type: 'json' };",
  ],
  ['a catalog for its side effects', "import '@/messages/en.json';"],
  ['a value next to a type', "import { type Namespace, getTranslator } from '@/i18n/translator';"],
  ['a re-export', "export { getTranslator } from '@/i18n/translator';"],
  ['a re-export of everything', "export * from '@/i18n/server';"],
  ['a catalog loaded later', "export const load = () => import('@/messages/en.json');"],
  [
    'whichever catalog a locale names',
    'export const load = (locale: string) => import(`@/messages/${locale}.json`);',
  ],
  ['any module in src/i18n', 'export const load = (name: string) => import(`../i18n/${name}`);'],
  [
    'whichever catalog a + chain names',
    "export const load = (locale: string) => import('@/messages/' + locale + '.json');",
  ],
  ['a catalog through require', "export const en = require('@/messages/en.json');"],
  // Everything in src/i18n/ but the modules listed as client-safe.
  ['another module in src/i18n', "import requestConfig from '@/i18n/request';"],
  ['a module src/i18n gains later', "import { messagesFor } from '@/i18n/messages-for';"],
] as const;

/** Imports a client file may have, translation-related or not. */
const ALLOWED = [
  ['React', "import { useState } from 'react';"],
  ['next-intl', "import { useTranslations } from 'next-intl';"],
  ['the i18n config, which has no catalog in it', "import { TIME_ZONE } from '@/i18n/config';"],
  ['a type from the translator', "import type { Namespace } from '@/i18n/translator';"],
  ['a type named inline', "import { type Namespace } from '@/i18n/translator';"],
  ['a type re-exported', "export type { Namespace } from '@/i18n/translator';"],
  ["a catalog's type", "import type en from '@/messages/en.json';"],
  // The declaration next-intl writes beside a catalog imports nothing.
  ["a catalog's generated declaration", "import messages from '@/messages/en.d.json';"],
  ['a JSON file outside the catalogs', "import data from './data.json';"],
  [
    'a module chosen at runtime from a folder without catalogs',
    'export const load = (name: string) => import(`./icons/${name}`);',
  ],
  [
    'a module a + chain picks from a folder without catalogs',
    "export const load = (name: string) => import('./icons/' + name);",
  ],
] as const;

beforeAll(async () => {
  // The first run loads every plugin the config names.
  await lint('');
}, 60_000);

describe('opensignup/no-catalogs-in-client', () => {
  it.each(FORBIDDEN)("fails a 'use client' file that imports %s", async (_, code) => {
    expect(await lint(CLIENT + code)).toHaveLength(1);
  });

  it.each(FORBIDDEN)('passes a server file that imports %s', async (_, code) => {
    expect(await lint(code)).toEqual([]);
  });

  it.each(ALLOWED)("passes a 'use client' file that imports %s", async (_, code) => {
    expect(await lint(CLIENT + code)).toEqual([]);
  });

  it('knows a client file by its directive however it is written', async () => {
    const code = "import { getTranslator } from '@/i18n/translator';";
    expect(await lint(`"use client";\n${code}`)).toHaveLength(1);
    expect(await lint(`// The sign-up dialog.\n'use client';\n${code}`)).toHaveLength(1);
    expect(await lint(`'use strict';\n'use client';\n${code}`)).toHaveLength(1);
    expect(await lint(`'use server';\n${code}`)).toEqual([]);
  });

  it('says why, and what to do instead', async () => {
    const [translator] = await lint(CLIENT + "import { getTranslator } from '@/i18n/translator';");
    expect(translator).toMatch(
      /can't import '@\/i18n\/translator': src\/i18n\/ is server code that loads every language's message catalog, and all of them would go into the browser's JavaScript\. Translate in a server component and pass the text in as props\./,
    );
    expect(translator).toMatch(
      /Or, if '@\/i18n\/translator' loads no catalog, now or through its imports, list it in CLIENT_SAFE_I18N in eslint\.config\.mjs\.$/,
    );
    const [catalog] = await lint(CLIENT + "import en from '@/messages/en.json';");
    expect(catalog).toMatch(
      /can't import '@\/messages\/en\.json': a message catalog holds the text of every page/,
    );
  });
});
