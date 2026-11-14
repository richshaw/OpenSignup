import type { ReactNode } from 'react';
import { ClientMessages } from '../ClientMessages';
import type { CatalogLocale } from '../config';
import { messagesFor, type Namespace } from '../translator';

/**
 * A `wrapper` for Testing Library's `render`, for a client component that
 * reads its text with `useTranslations`: it gets the English messages of
 * `namespaces` (one or a list), as the page that renders it passes them.
 */
export function englishMessages(namespaces: Namespace | readonly Namespace[]) {
  return function EnglishMessages({ children }: { children: ReactNode }) {
    return (
      <ClientMessages locale="en" messages={messagesFor('en', namespaces)}>
        {children}
      </ClientMessages>
    );
  };
}

type Messages = ReturnType<typeof messagesFor>;

/**
 * The same, in `locale`, with every message standing in for itself as
 * `getStandInTranslator` (./translator) answers: `participant.dialog.done` in
 * Swedish reads "participant.dialog.done in sv", arguments and tags left
 * out. For a test that a client component's text all comes from the messages
 * its page passes, in the language it passes them in, including a language
 * with no catalog yet.
 */
export function standInMessages(locale: string, namespaces: Namespace | readonly Namespace[]) {
  const standIn = (section: Messages, path: string): Messages =>
    Object.fromEntries(
      Object.entries(section).map(([key, value]) => [
        key,
        typeof value === 'object' && !Array.isArray(value)
          ? standIn(value, `${path}${key}.`)
          : `${path}${key} in ${locale}`,
      ]),
    );
  const messages = standIn(messagesFor('en', namespaces), '');
  return function StandInMessages({ children }: { children: ReactNode }) {
    return (
      // A language that may have no catalog yet, which the type doesn't allow.
      <ClientMessages locale={locale as CatalogLocale} messages={messages}>
        {children}
      </ClientMessages>
    );
  };
}
