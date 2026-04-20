import { randomBytes } from 'node:crypto';

const CROCKFORD = '0123456789abcdefghjkmnpqrstvwxyz';

export function randomSuffix(length = 5): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    const byte = bytes[i] ?? 0;
    out += CROCKFORD[byte % CROCKFORD.length];
  }
  return out;
}

function normalize(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 60);
}

export interface SlugOptions {
  suffix?: boolean;
  fallback?: string;
  maxLength?: number;
}

export function toSlug(input: string, opts: SlugOptions = {}): string {
  const { suffix = false, fallback = 'signup', maxLength = 60 } = opts;
  let base = normalize(input);
  if (!base) base = fallback;
  if (base.length > maxLength) base = base.slice(0, maxLength).replace(/-+$/, '');
  if (!suffix) return base;
  return `${base}-${randomSuffix(5)}`;
}
