import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Only `src/i18n/ClientMessages.tsx` may import next-intl's messages provider
 * (`no-restricted-imports` in eslint.config.mjs). Anywhere else it can end up
 * in a server component, where next-intl gives the server's provider, which
 * reads the request config, and with it the request's headers, for every prop
 * it isn't given. Run through the repo's own config, so these also prove the
 * rule is on for the app's files.
 */
const RULE = 'no-restricted-imports';
const eslint = new ESLint({ cwd: resolve(import.meta.dirname, '../..') });

async function lint(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  // A fixture that doesn't parse would pass every rule without being looked at.
  const fatal = result?.messages.find((message) => message.fatal);
  if (fatal) throw new Error(`fixture doesn't parse: ${fatal.message}`);
  return (result?.messages ?? [])
    .filter((message) => message.ruleId === RULE)
    .map((message) => message.message);
}

const CLIENT = "'use client';\n";

/** Every way to the provider, next-intl's own and use-intl's under it. */
const PROVIDERS = [
  ["next-intl's provider", "import { NextIntlClientProvider } from 'next-intl';"],
  ['it under another name', "import { NextIntlClientProvider as Provider } from 'next-intl';"],
  ["next-intl's copy of use-intl's", "import { IntlProvider } from 'next-intl';"],
  ["use-intl's", "import { IntlProvider } from 'use-intl';"],
  ["use-intl's, from its React entry", "import { IntlProvider } from 'use-intl/react';"],
  ['a re-export', "export { NextIntlClientProvider } from 'next-intl';"],
  ['everything next-intl has', "import * as intl from 'next-intl';"],
] as const;

/** What next-intl gives a client component that reads messages. */
const ALLOWED = [
  ['the hook', "import { useTranslations } from 'next-intl';"],
  ['the other hooks', "import { useLocale, useTimeZone } from 'next-intl';"],
  ['ClientMessages', "import { ClientMessages } from '@/i18n/ClientMessages';"],
  [
    "use-intl's translator, which the server uses",
    "import { createTranslator } from 'use-intl/core';",
  ],
  ["next-intl's request config", "import { getRequestConfig } from 'next-intl/server';"],
] as const;

beforeAll(async () => {
  // The first run loads every plugin the config names.
  await lint('', 'src/app/example.tsx');
}, 60_000);

describe('only ClientMessages imports the messages provider', () => {
  it.each(PROVIDERS)('fails a server component that imports %s', async (_, code) => {
    expect(await lint(code, 'src/app/s/[slug]/example.tsx')).toHaveLength(1);
  });

  it.each(PROVIDERS)("fails a 'use client' file that imports %s", async (_, code) => {
    expect(await lint(CLIENT + code, 'src/components/example.tsx')).toHaveLength(1);
  });

  it.each(PROVIDERS)('fails a test that imports %s', async (_, code) => {
    expect(await lint(code, 'src/app/s/[slug]/example.test.tsx')).toHaveLength(1);
  });

  it.each(ALLOWED)('passes %s', async (_, code) => {
    expect(await lint(CLIENT + code, 'src/components/example.tsx')).toEqual([]);
    expect(await lint(code, 'src/app/s/[slug]/example.tsx')).toEqual([]);
  });

  it('passes ClientMessages itself', async () => {
    expect(await lint(CLIENT + PROVIDERS[0][1], 'src/i18n/ClientMessages.tsx')).toEqual([]);
  });

  it('says what to do instead', async () => {
    const [message] = await lint(PROVIDERS[0][1], 'src/app/example.tsx');
    expect(message).toMatch(
      /Only src\/i18n\/ClientMessages\.tsx may import the messages provider: wrap the client components in <ClientMessages>, with the messages from messagesFor, instead\.$/,
    );
  });
});
