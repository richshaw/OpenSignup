import type { Translator } from '@/i18n/translator';
import type { OwnLines } from '@/lib/organizer-errors';

/**
 * Connected apps' own lines for the `?error=` its Disconnect sends back,
 * which the page passes to `refusalFromQuery`: a disconnect that failed for a
 * reason the page can't name says so. Every other code gets the line every
 * screen gives it. A function of its own, so the test that reads every
 * organizer refusal through a stand-in translator
 * (src/lib/organizer-reasons.test.ts) calls the page's own words, and English
 * written in here fails it.
 */
export function connectedAppsLines(errors: Translator<'organizer.errors'>): OwnLines {
  return { internal: errors('disconnectFailed') };
}
