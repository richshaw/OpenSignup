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

export function suggestEmail(email: string): string | null {
  const at = email.indexOf('@');
  if (at < 0) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  if (!domain) return null;
  if (COMMON_DOMAINS.includes(domain)) return null;

  let best: { domain: string; distance: number } | null = null;
  for (const candidate of COMMON_DOMAINS) {
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
