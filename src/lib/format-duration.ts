type Unit = 'minute' | 'hour' | 'day';

/*
 * These take the reader's language as `locale` ('en', 'sv'), and `Intl`
 * writes each amount in it: the number, the unit's name and its plural ("1
 * minute", "30 minutes"; "1 minut", "30 minuter"). Without grouping, so
 * English keeps "1000 days" as it always has.
 *
 * `locale` defaults to English rather than being required, because some
 * callers are sign-in and OAuth code (the login check page, the OAuth handler,
 * the consent route) that gets the reader's language when its own text does.
 */

function amount(n: number, unit: Unit, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    unitDisplay: 'long',
    useGrouping: false,
  }).format(n);
}

/** Two amounts side by side, as the language writes them: "1 hour 30 minutes". */
function pair(first: string, second: string, locale: string): string {
  return new Intl.ListFormat(locale, { type: 'unit', style: 'narrow' }).format([first, second]);
}

/**
 * Whole minutes to wait out a rate limit's `retryAfterSeconds`. Rounds UP and
 * never says under one, so nobody is told to come back before the limit lifts.
 */
export function waitMinutes(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60));
}

/** A rate limit's wait in words: "1 minute", "57 minutes". */
export function waitInMinutes(seconds: number, locale = 'en'): string {
  return amount(waitMinutes(seconds), 'minute', locale);
}

// Never overstates: an expiration deadline must round DOWN, so a link advertised
// as "1 hour 30 minutes" never expires before that claim.
export function formatDuration(minutes: number, locale = 'en'): string {
  if (minutes < 60) return amount(minutes, 'minute', locale);

  if (minutes < 60 * 24) {
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return rem === 0
      ? amount(hours, 'hour', locale)
      : pair(amount(hours, 'hour', locale), amount(rem, 'minute', locale), locale);
  }

  const days = Math.floor(minutes / (60 * 24));
  const remMin = minutes - days * 60 * 24;
  const remHours = Math.floor(remMin / 60);
  return remHours === 0
    ? amount(days, 'day', locale)
    : pair(amount(days, 'day', locale), amount(remHours, 'hour', locale), locale);
}
