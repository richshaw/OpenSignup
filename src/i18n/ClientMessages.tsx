'use client';

/**
 * The messages client components read with next-intl's `useTranslations`. A
 * server component wraps them in this, with their language and just the
 * messages they read, from `messagesFor` (`./translator`):
 *
 *   <ClientMessages locale={locale} messages={messagesFor(locale, 'participant.fields')}>
 *
 * It's a client component, and the only module that may import next-intl's
 * provider (a lint rule in eslint.config.mjs). Imported by a server component,
 * `next-intl` gives the server's provider instead, which fills every prop it
 * isn't given (the time zone, formats, `now`) from the request config, and
 * reading that reads the request's headers, so a page built once at build
 * time would be rendered for every request. The client's provider takes what
 * it's given and never looks for a config.
 *
 * It sets no `onError` or `getMessageFallback`, on purpose. `messagesFor` lays
 * English under every language, so a message a partial catalog lacks shows in
 * English and reaches neither. What's left is a bug, like a namespace the page
 * didn't pass, and use-intl's defaults suit it: `console.error`, and the
 * message's key path in its place, as the server's translator does, with
 * nothing thrown. An argument passed as `undefined` reaches neither: the
 * precompiled formatter the Next build uses, on the server and in the
 * browser, prints "undefined" in its place. No `formats` or `now` either: no
 * message uses a named format or a relative time.
 */
import { NextIntlClientProvider, type Messages } from 'next-intl';
import type { ReactNode } from 'react';
import type { CatalogLocale } from './config';
import type { messagesFor } from './translator';

export function ClientMessages({
  locale,
  messages,
  children,
}: {
  locale: CatalogLocale;
  messages: ReturnType<typeof messagesFor>;
  children: ReactNode;
}) {
  return (
    <NextIntlClientProvider
      locale={locale}
      // Only some namespaces, which next-intl's types can't express.
      messages={messages as Messages}
      // `TIME_ZONE` (./time-zone.ts), as every translator has, and a test
      // checks they agree. Written out: imported here as well, webpack could
      // no longer inline it into slot-label.ts, which cost the Build tab and
      // these pages about 25 bytes each.
      timeZone="UTC"
    >
      {children}
    </NextIntlClientProvider>
  );
}
