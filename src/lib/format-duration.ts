function pluralize(n: number, unit: 'minute' | 'hour' | 'day'): string {
  return `${n} ${n === 1 ? unit : `${unit}s`}`;
}

/**
 * Whole minutes to wait out a rate limit's `retryAfterSeconds`. Rounds UP and
 * never says under one, so nobody is told to come back before the limit lifts.
 */
export function waitMinutes(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60));
}

/** A rate limit's wait in words: "1 minute", "57 minutes". */
export function waitInMinutes(seconds: number): string {
  return pluralize(waitMinutes(seconds), 'minute');
}

// Never overstates: an expiration deadline must round DOWN, so a link advertised
// as "1 hour 30 minutes" never expires before that claim.
export function formatDuration(minutes: number): string {
  if (minutes < 60) return pluralize(minutes, 'minute');

  if (minutes < 60 * 24) {
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return rem === 0
      ? pluralize(hours, 'hour')
      : `${pluralize(hours, 'hour')} ${pluralize(rem, 'minute')}`;
  }

  const days = Math.floor(minutes / (60 * 24));
  const remMin = minutes - days * 60 * 24;
  const remHours = Math.floor(remMin / 60);
  return remHours === 0
    ? pluralize(days, 'day')
    : `${pluralize(days, 'day')} ${pluralize(remHours, 'hour')}`;
}
