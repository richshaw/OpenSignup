/**
 * The message catalogs as the web process gets them, for tests.
 *
 * In the Next build, next-intl's loader compiles each catalog the app imports
 * (`precompile` in next.config.mjs), and the plugin swaps use-intl's formatter
 * for one that only formats compiled messages. Vitest and the reminder worker
 * import the raw JSON and format it with use-intl's full formatter, so a test
 * that goes through `getTranslator` sees the worker's text. These give a test
 * the web process's: ../precompiled.test.ts compares the two for every
 * message, and a test of text sent from both processes, like an email,
 * can check its own.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cloneElement, isValidElement } from 'react';
import catalogLoader from 'next-intl/extractor/catalogLoader';
import { _createCache, _createIntlFormatters } from 'use-intl/core';
import formatPrecompiled from 'use-intl/format-message/format-only';
import type { CatalogLocale } from '../config';
import { TIME_ZONE } from '../time-zone';
import {
  namespaceMessages,
  type Namespace,
  type Translator,
  type withEnglishUnder,
} from '../translator';

export type Catalog = Parameters<typeof withEnglishUnder>[0];

const ROOT = path.resolve(import.meta.dirname, '../../..');

/**
 * What `import messages from '@/messages/<locale>.json'` gives the web
 * process: the catalog run through the plugin's loader with the options
 * next.config.mjs gives it.
 */
export function precompile(resourcePath: string, source: string): Promise<Catalog> {
  return new Promise((resolve, reject) => {
    const context = {
      getOptions: () => ({ messages: { format: 'json', precompile: true } }),
      async: () => (error: Error | null, result?: string) => {
        if (error) return reject(error);
        // The loader emits a module: `export default JSON.parse("…");`.
        const json = /^export default JSON\.parse\((".*")\);$/s.exec(result ?? '')?.[1];
        if (!json) return reject(new Error(`unexpected loader output: ${result}`));
        resolve(JSON.parse(JSON.parse(json)));
      },
      resourcePath,
      rootContext: ROOT,
    };
    catalogLoader.call(context as never, source);
  });
}

export function precompiledCatalog(locale: string): Promise<Catalog> {
  const file = path.join(ROOT, 'src/messages', `${locale}.json`);
  return precompile(file, readFileSync(file, 'utf8'));
}

/**
 * A translator for `namespace` in `locale` that formats the way the web
 * process does: the precompiled catalogs, with English laid under the
 * language's own as `getTranslator` lays it, through use-intl's precompiled
 * formatter. `t(key, values)`, `t.rich` and `t.markup`, each as use-intl
 * builds it around the formatter; a key with no message throws, and so does
 * `t` or `t.markup` on a message that doesn't come out as text.
 */
export async function getPrecompiledTranslator<N extends Namespace>(
  locale: CatalogLocale,
  namespace: N,
): Promise<Translator<N>> {
  const [english, own] = await Promise.all([precompiledCatalog('en'), precompiledCatalog(locale)]);
  const messages = namespaceMessages(namespace, english, own);
  const cache = _createCache();
  const formatters = _createIntlFormatters(cache);
  const rich = (key: string, values?: Record<string, unknown>): unknown => {
    const full = `${namespace}.${key}`;
    let message: unknown = messages;
    for (const part of full.split('.')) {
      message =
        typeof message === 'object' && message !== null && !Array.isArray(message)
          ? (message as Catalog)[part]
          : undefined;
    }
    if (typeof message !== 'string' && !Array.isArray(message)) {
      throw new Error(`no message at ${full}`);
    }
    return formatPrecompiled(full, message as never, values && (withKeyedTags(values) as never), {
      cache,
      formatters,
      locale,
      timeZone: TIME_ZONE,
    });
  };
  const text = (key: string, values?: Record<string, unknown>) => {
    const result = rich(key, values);
    if (typeof result !== 'string') throw new Error(`${namespace}.${key} did not format to text`);
    return result;
  };
  return Object.assign(text, { rich, markup: text }) as unknown as Translator<N>;
}

/**
 * `values` with each tag's function wrapped so the element it returns gets a
 * key of the tag's name and a count, as use-intl's translator does before it
 * formats (its `prepareTranslationValues`), so a rich message's parts render
 * as a list without React's missing-key warning.
 */
function withKeyedTags(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => {
      if (typeof value !== 'function') return [name, value];
      let index = 0;
      const tag = (chunks: unknown) => {
        const result: unknown = value(chunks);
        return isValidElement(result) ? cloneElement(result, { key: `${name}${index++}` }) : result;
      };
      return [name, tag];
    }),
  );
}
