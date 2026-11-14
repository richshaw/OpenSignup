import type { ReactNode } from 'react';
import { ClientMessages } from '../ClientMessages';
import { messagesFor, type Namespace } from '../translator';

/**
 * A `wrapper` for Testing Library's `render`, for a client component that
 * reads its text with `useTranslations`: it gets `namespace`'s English
 * messages, as the page that renders it passes them.
 */
export function englishMessages(namespace: Namespace) {
  return function EnglishMessages({ children }: { children: ReactNode }) {
    return (
      <ClientMessages locale="en" messages={messagesFor('en', namespace)}>
        {children}
      </ClientMessages>
    );
  };
}
