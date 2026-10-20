import { randomInt } from 'node:crypto';
import { toKebab } from './kebab';

const CROCKFORD = '0123456789abcdefghjkmnpqrstvwxyz';

export function randomSuffix(length = 5): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CROCKFORD[randomInt(CROCKFORD.length)];
  }
  return out;
}

export interface SlugOptions {
  suffix?: boolean;
  fallback?: string;
  maxLength?: number;
}

export function toSlug(input: string, opts: SlugOptions = {}): string {
  const { suffix = false, fallback = 'signup', maxLength = 60 } = opts;
  let base = toKebab(input);
  if (!base) base = fallback;
  if (base.length > maxLength) base = base.slice(0, maxLength).replace(/-+$/, '');
  if (!suffix) return base;
  return `${base}-${randomSuffix(5)}`;
}
