function pluralize(n: number, unit: 'minute' | 'hour' | 'day'): string {
  return `${n} ${n === 1 ? unit : `${unit}s`}`;
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
