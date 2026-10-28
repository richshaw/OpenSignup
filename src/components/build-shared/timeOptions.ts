/**
 * The times a time select offers: every 15 minutes as 24-hour "HH:MM", in
 * order. Kept to plain string work because the Build page is at its
 * JavaScript budget.
 *
 * With `after`, only later times are listed. A `value` off the grid (09:10,
 * from the AI or an older edit) is listed in its place, so showing it never
 * changes it.
 */
export function timeOptions(value: string, after?: string): string[] {
  const times: string[] = [];
  for (let i = 0; i < 96; i++) {
    const t = `${i >> 2}:${(i & 3) * 15}`.replace(/\b\d\b/g, '0$&');
    // "HH:MM" strings sort as the times do.
    if (!after || t > after) times.push(t);
  }
  if (value && !times.includes(value)) times.push(value);
  return times.sort();
}
