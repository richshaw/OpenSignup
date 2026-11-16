/**
 * A connected app's approval, last-use or expiry date in the organizer's
 * language: "14 Nov 2026" in English, "14 nov. 2026" in Swedish. English keeps
 * the day-first British order this page has always shown, which no reader
 * takes for another day. Formatted in the server's time zone, as it always
 * has been.
 */
export function formatGrantDate(d: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}
