import type { CatalogLocale } from '@/i18n/config';

/** Domains offered on every signup, whatever its language. */
const COMMON_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'live.com',
  'proton.me',
  'protonmail.com',
];

/**
 * Domains offered only on a signup in that language, beside the common ones.
 * Kept apart so that a real address from another country isn't "corrected":
 * with `hotmail.se` on every signup, a German's `hotmail.de` would be one edit
 * from it.
 */
const DOMAINS_BY_LOCALE = new Map<CatalogLocale, readonly string[]>([
  [
    'sv',
    [
      'hotmail.se',
      'live.se',
      'yahoo.se',
      'telia.com',
      'comhem.se',
      'bredband.net',
      'spray.se',
      'bahnhof.se',
    ],
  ],
]);

/**
 * The address the participant probably meant, when the part after the `@` is
 * a close typo of a common domain or of one common in the signup's language
 * (`locale`), else null.
 */
export function suggestEmail(email: string, locale?: string): string | null {
  const known = [...COMMON_DOMAINS, ...(DOMAINS_BY_LOCALE.get(locale as CatalogLocale) ?? [])];
  const at = email.indexOf('@');
  if (at < 0) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  if (!domain) return null;
  if (known.includes(domain)) return null;

  let best: { domain: string; distance: number } | null = null;
  for (const candidate of known) {
    const d = levenshtein(domain, candidate);
    if (!best || d < best.distance) best = { domain: candidate, distance: d };
  }

  if (!best || best.distance === 0 || best.distance > 2) return null;
  // Avoid suggesting when they've written a short but unrelated domain
  if (domain.length < 5 && best.distance > 1) return null;
  return `${local}@${best.domain}`;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min((curr[j - 1] ?? 0) + 1, (prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n] ?? 0;
}
