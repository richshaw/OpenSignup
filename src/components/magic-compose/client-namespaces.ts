import type { Namespace } from '@/i18n/translator';

/**
 * The sections of the catalog Magic Compose's client components read with
 * `useTranslations`, and so what the New signup page gives `ClientMessages`
 * through `messagesFor`: Magic Compose's own words, and the line for a
 * refusal's code, which the pages rendered on the server use too, so it's
 * one message in every language. Here rather than beside the components,
 * because a value a `'use client'` module exports reaches a server component
 * as a client reference, not as the value.
 */
export const MAGIC_COMPOSE_NAMESPACES = [
  'organizer.compose',
  'organizer.errors',
] as const satisfies readonly Namespace[];
