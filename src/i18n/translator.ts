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
 */
import {
  createTranslator,
  type IntlError,
  type Messages,
  type NamespaceKeys,
  type NestedKeyOf,
} from 'use-intl/core';
import en from '@/messages/en.json';
import { type CatalogLocale, TIME_ZONE } from './config';

/** A top-level namespace of the catalog (`common`) or one inside it (`common.footer`). */
export type Namespace = NamespaceKeys<Messages, NestedKeyOf<Messages>>;

type Catalog = { [key: string]: string | Catalog };

const CATALOGS: Record<CatalogLocale, Catalog> = { en };

/** Each language's catalog with English under it, per top-level namespace, built once. */
const merged = new Map<string, Catalog>();

/**
 * A translator for `namespace` in `locale`. A message the language's catalog
 * lacks comes out in English rather than as its key path. `onError` hears of
 * anything still wrong: a key missing from English too, or a message that
 * can't be formatted.
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

function messagesFor(locale: CatalogLocale, namespace: string): Catalog {
  const top = namespace.split('.')[0] ?? namespace;
  const key = `${locale}:${top}`;
  let messages = merged.get(key);
  if (!messages) {
    const english = CATALOGS.en[top];
    messages = {
      [top]: typeof english === 'object' ? withEnglishUnder(english, CATALOGS[locale][top]) : {},
    };
    merged.set(key, messages);
  }
  return messages;
}

/**
 * `own` laid over `english`, key by key. English decides the shape: a key
 * `own` lacks, or holds something of the wrong kind for, keeps the English
 * message, and a key only `own` has is dropped.
 */
export function withEnglishUnder(english: Catalog, own: string | Catalog | undefined): Catalog {
  const result: Catalog = {};
  for (const [key, base] of Object.entries(english)) {
    const value = typeof own === 'object' ? own[key] : undefined;
    if (typeof base === 'object') result[key] = withEnglishUnder(base, value);
    else result[key] = typeof value === 'string' ? value : base;
  }
  return result;
}
