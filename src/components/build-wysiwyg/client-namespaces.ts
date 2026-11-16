import type { Namespace } from '@/i18n/translator';

/**
 * The sections of the catalog the Build tab's client components read with
 * `useTranslations`, and so what its page gives `ClientMessages` through
 * `messagesFor`: the tab's own words, and the two it shares with the pages
 * rendered on the server, a refusal's line for its code (and the title
 * that's too short) and Saved, so each is one message in every language.
 * Here rather than beside the components, because a value a `'use client'`
 * module exports reaches a server component as a client reference, not as
 * the value.
 */
export const BUILD_TAB_NAMESPACES = [
  'organizer.build',
  'organizer.errors',
  'organizer.saveNotice',
] as const satisfies readonly Namespace[];
