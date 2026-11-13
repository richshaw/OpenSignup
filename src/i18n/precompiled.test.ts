import { readFileSync } from 'node:fs';
import path from 'node:path';
import catalogLoader from 'next-intl/extractor/catalogLoader';
import { describe, expect, it } from 'vitest';
import { _createCache, _createIntlFormatters, createTranslator } from 'use-intl/core';
// The formatter next-intl's plugin puts in place of use-intl's full one in
// the Next build when messages are precompiled.
import formatPrecompiled from 'use-intl/format-message/format-only';
import { CATALOG_LOCALES, TIME_ZONE } from './config';
import { getTranslator, type Namespace, withEnglishUnder } from './translator';

/**
 * Two formatters run in production. In the Next build, next-intl's loader
 * compiles each catalog the app imports (`precompile` in next.config.mjs) and
 * the web process formats the compiled messages with use-intl's format-only
 * formatter. The reminder worker and vitest format the raw JSON with use-intl's
 * full formatter. This runs the build's loader over every catalog, lays
 * English under each language as `getTranslator` does, and checks that every
 * message comes out the same both ways, with values of the kind each of its
 * placeholders takes.
 *
 * They don't always agree. The precompiled formatter knows no ICU style names:
 * `{when, time, short}` or `{share, number, percent}` comes out as if no style
 * were given. Write a skeleton instead (`{when, date, ::yyyyMMMd}`), or give
 * the style to both formatters in `formats` where getTranslator creates the
 * translator.
 */

type Catalog = Parameters<typeof withEnglishUnder>[0];
type Values = Record<string, string | number | Date | ((chunks: unknown) => string)>;

const ROOT = path.resolve(import.meta.dirname, '../..');

/**
 * What `import messages from '@/messages/<locale>.json'` gives the web
 * process: the catalog run through the plugin's loader with the options
 * next.config.mjs gives it.
 */
function precompile(resourcePath: string, source: string): Promise<Catalog> {
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

function precompiledCatalog(locale: string): Promise<Catalog> {
  const file = path.join(ROOT, 'src/messages', `${locale}.json`);
  return precompile(file, readFileSync(file, 'utf8'));
}

/** Every message in `catalog`, by its full key. */
function* messagesOf(catalog: Catalog, prefix = ''): Generator<[string, unknown]> {
  for (const [key, value] of Object.entries(catalog)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && !Array.isArray(value)) yield* messagesOf(value, full);
    else yield [full, value];
  }
}

// icu-minify's node types: [name, type, options or style].
const SELECT = 1;
const PLURAL = 2;
const SELECTORDINAL = 3;
const NUMBER = 4;
const DATE = 5;
const TIME = 6;

/** Each sample sets every number to one of these, and picks a different select branch. */
const COUNTS = [0, 1, 2, 5, 1234];
const WHEN = new Date(Date.UTC(2026, 0, 31, 18, 30));

/**
 * Values for every placeholder in a compiled message: text for a plain one, a
 * number for a plural or a number, a date, a branch for a select (sample `i`
 * picks the `i`th, and one past the end reaches `other`), and a function that
 * wraps its chunks for a tag.
 */
function sampleValues(message: unknown, i: number): Values {
  const values: Values = {};
  const visitAll = (nodes: unknown) => {
    if (Array.isArray(nodes)) nodes.forEach(visit);
  };
  const visit = (node: unknown): void => {
    if (!Array.isArray(node)) return; // plain text, or a plural's `#`
    const [name, type, ...rest] = node as [string, unknown, ...unknown[]];
    if (node.length === 1) {
      values[name] ??= `‹${name}›`;
    } else if (type === SELECT) {
      const options = rest[0] as Record<string, unknown>;
      const branches = [...Object.keys(options).filter((k) => k !== 'other'), '‹other›'];
      values[name] = branches[i % branches.length] ?? '‹other›';
      Object.values(options).forEach(visitAll);
    } else if (type === PLURAL || type === SELECTORDINAL) {
      values[name] = COUNTS[i] ?? 0;
      Object.values(rest[0] as Record<string, unknown>).forEach(visitAll);
    } else if (type === NUMBER) {
      values[name] = COUNTS[i] ?? 0;
    } else if (type === DATE || type === TIME) {
      values[name] = WHEN;
    } else {
      // A tag: its name, then its children.
      values[name] = (chunks) => `<${name}>${[chunks].flat().join('')}</${name}>`;
      [type, ...rest].forEach(visit);
    }
  };
  visitAll(message);
  return values;
}

/**
 * Where the precompiled formatter's text differs from `formatRaw`'s, one line
 * per message, for the first sample that differs.
 */
function disagreements(
  compiled: Catalog,
  locale: string,
  formatRaw: (key: string, values: Values) => string,
): string[] {
  const cache = _createCache();
  const formatters = _createIntlFormatters(cache);
  const problems: string[] = [];
  for (const [key, message] of messagesOf(compiled)) {
    for (const i of COUNTS.keys()) {
      const values = sampleValues(message, i);
      const attempt = (format: () => unknown) => {
        try {
          return format();
        } catch (error) {
          return `throws ${(error as Error).message}`;
        }
      };
      const raw = attempt(() => formatRaw(key, values));
      const precompiled = attempt(() =>
        formatPrecompiled(key, message as never, values as never, {
          cache,
          formatters,
          locale,
          timeZone: TIME_ZONE,
        }),
      );
      if (raw !== precompiled) {
        problems.push(
          `${locale} ${key}: ${JSON.stringify(raw)} from the raw JSON, ${JSON.stringify(precompiled)} precompiled`,
        );
        break;
      }
    }
  }
  return problems;
}

describe('the precompiled catalogs', () => {
  it.each(CATALOG_LOCALES)('format every %s message as the raw JSON does', async (locale) => {
    const english = await precompiledCatalog('en');
    const own = await precompiledCatalog(locale);
    const problems: string[] = [];
    for (const [top, section] of Object.entries(english)) {
      if (typeof section !== 'object' || Array.isArray(section)) continue;
      const t = getTranslator(locale, top as Namespace, {
        onError: (error) => {
          throw error;
        },
      });
      const merged = { [top]: withEnglishUnder(section, own[top]) };
      problems.push(
        ...disagreements(merged, locale, (key, values) =>
          t.markup(key.slice(top.length + 1) as never, values as never),
        ),
      );
    }
    expect(problems).toEqual([]);
  });

  it('include a message the build compiles, so the comparison means something', async () => {
    const english = await precompiledCatalog('en');
    expect([...messagesOf(english)].some(([, message]) => Array.isArray(message))).toBe(true);
  });
});

describe('the comparison', () => {
  const fixture = {
    plural: '{count, plural, =0 {No spots} one {# spot} other {# spots}} left',
    ordinal: 'Your {n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} spot',
    select: '{status, select, open {Open} closed {Closed} other {Unknown}} for {name}',
    tag: 'Read <link>the guide</link>, {name}',
    number: '{count, number} people',
    skeleton: 'On {when, date, ::yyyyMMMd}',
    escaped: "It''s '{'literal'}'",
    styled: 'At {when, time, short}',
  };

  it('passes messages both formatters format alike, and reports one they don’t', async () => {
    const compiled = await precompile(
      path.join(ROOT, 'fixture/en.json'),
      JSON.stringify({ fixture }),
    );
    const t = createTranslator({
      locale: 'en',
      messages: { fixture },
      namespace: 'fixture',
      timeZone: TIME_ZONE,
      onError: (error) => {
        throw error;
      },
    });
    const problems = disagreements(compiled, 'en', (key, values) =>
      t.markup(key.slice('fixture.'.length) as never, values as never),
    );
    expect(problems).toEqual([
      'en fixture.styled: "At 6:30 PM" from the raw JSON, "At 1/31/2026" precompiled',
    ]);
  });
});
