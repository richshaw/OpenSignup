// Returns the substring after the first `@`, or `'unknown'` if absent
// or empty. Intentionally lenient — the auth layer validates the
// address upstream. No lowercasing, no IDN handling: aggregate
// consumers that need case-insensitive grouping should normalize at
// query time.
export function extractEmailDomain(email: string): string {
  const domain = email.split('@')[1];
  return domain && domain.length > 0 ? domain : 'unknown';
}
