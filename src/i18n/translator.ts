/**
 * The translator for everything but client components: server components,
 * route handlers, services, emails, the reminder worker and tests.
 *
 * It is synchronous, so server components stay synchronous (their jsdom tests
 * render them with a plain `render()`), and it is built on `use-intl/core`,
 * which runs the same under Next, tsx and vitest. It returns the function type
 * `useTranslations` returns, so a helper that takes a translator also works in
 * a client component.
 *
 * Every catalog is imported here, so a client file must never import this
 * module: it would put every language in the browser's JavaScript. It has no
 * logging import either, because Playwright specs import app copy modules, so
 * the caller decides what a missing message does. Server code gets a
 * translator that logs from `getServerTranslator` in `./server`; tests get one
 * that throws from `./testing/translator`.
 *
 * Catalogs are imported as modules, never read from disk. In the Next build,
 * next-intl's loader compiles each catalog the app imports (`precompile` in
 * next.config.mjs), and the plugin swaps use-intl's formatter for one that
 * only formats compiled messages: a message read any other way would show its
 * `{placeholders}` unfilled in the web process. The reminder worker and vitest
 * import the raw JSON and format it with use-intl's full formatter, so both
 * kinds of message pass through here.
 */
import type { CompiledMessage } from 'icu-minify/format';
import {
  createTranslator,
  type IntlError,
  type Messages,
  type NamespaceKeys,
  type NestedKeyOf,
} from 'use-intl/core';
import en from '@/messages/en.json';
import type { CatalogLocale } from './config';
import { TIME_ZONE } from './time-zone';

/** A top-level namespace of the catalog (`common`) or one inside it (`common.footer`). */
export type Namespace = NamespaceKeys<Messages, NestedKeyOf<Messages>>;

/**
 * A message as a catalog holds it: the ICU text, or, in the Next build, the
 * same message compiled by icu-minify. Compiling leaves plain text a string
 * and turns a message with an argument, a plural or a tag into an array
 * (`"Hi {name}"` becomes `["Hi ", ["name"]]`).
 */
type Message = CompiledMessage;

type Catalog = { [key: string]: Message | Catalog };

function isMessage(value: unknown): value is Message {
  return typeof value === 'string' || Array.isArray(value);
}

/** A section of messages: an object that isn't a compiled message. */
function isSection(value: unknown): value is Catalog {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const CATALOGS: Record<CatalogLocale, Catalog> = { en };

/** Each language's catalog with English under it, per top-level namespace, built once. */
const merged = new Map<string, Catalog>();

/**
 * A translator for `namespace` in `locale`. A message the language's catalog
 * lacks comes out in English rather than as its key path. `onError` hears of
 * anything still wrong: a key missing from English too, or a message that
 * can't be formatted. In the web process it doesn't hear of an argument
 * passed as `undefined`: the precompiled formatter prints "undefined" in its
 * place and reports nothing. TypeScript requires every argument, so only a
 * value that is `undefined` at runtime gets there.
 */
export function getTranslator<N extends Namespace>(
  locale: CatalogLocale,
  namespace: N,
  { onError }: { onError: (error: IntlError) => void },
) {
  return createTranslator<Messages, N>({
    locale,
    namespace,
    // Just the top-level section `namespace` sits in: all a translator for it can reach.
    messages: messagesFor(locale, namespace) as Messages,
    onError,
    timeZone: TIME_ZONE,
  });
}

/**
 * What `getTranslator` returns for `namespace`, for a helper that takes a
 * translator rather than making one. Import it with `import type`, which
 * brings no catalog along, so a module a client file imports can take one.
 */
export type Translator<N extends Namespace> = ReturnType<typeof getTranslator<N>>;

function messagesFor(locale: CatalogLocale, namespace: string): Catalog {
  const top = namespace.split('.')[0] ?? namespace;
  const key = `${locale}:${top}`;
  let messages = merged.get(key);
  if (!messages) {
    const english = CATALOGS.en[top];
    messages = {
      [top]: isSection(english) ? withEnglishUnder(english, CATALOGS[locale][top]) : {},
    };
    merged.set(key, messages);
  }
  return messages;
}

/**
 * `own` laid over `english`, key by key. English decides the shape: a key
 * `own` lacks, or holds something of the wrong kind for, keeps the English
 * message, and a key only `own` has is dropped. A compiled message is an
 * array, and is kept whole like a string: only a section is gone into.
 */
export function withEnglishUnder(english: Catalog, own: Message | Catalog | undefined): Catalog {
  const result: Catalog = {};
  for (const [key, base] of Object.entries(english)) {
    const value = isSection(own) ? own[key] : undefined;
    if (isSection(base)) result[key] = withEnglishUnder(base, value);
    else result[key] = isMessage(value) ? value : base;
  }
  return result;
}
