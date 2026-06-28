import { randomInt } from 'node:crypto';

const CROCKFORD = '0123456789abcdefghjkmnpqrstvwxyz';

export function randomSuffix(length = 5): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CROCKFORD[randomInt(CROCKFORD.length)];
  }
  return out;
}

function normalize(input: string, maxLength: number): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, maxLength)
    // Truncating can land mid-word and leave a dangling separator.
    .replace(/-+$/, '');
}

export interface SlugOptions {
  suffix?: boolean;
  fallback?: string;
  maxLength?: number;
}

export function toSlug(input: string, opts: SlugOptions = {}): string {
  const { suffix = false, fallback = 'signup', maxLength = 60 } = opts;
  let base = normalize(input, maxLength);
  if (!base) base = fallback;
  if (!suffix) return base;
  return `${base}-${randomSuffix(5)}`;
}
