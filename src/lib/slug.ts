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

const SUFFIX = new RegExp(`-[${CROCKFORD}]{5}$`);

/**
 * A slug without the suffix `toSlug(…, { suffix: true })` added, so two
 * titles can be compared by the words their slugs keep. A slug without one
 * comes back as it is.
 */
export function slugBase(slug: string): string {
  return slug.replace(SUFFIX, '');
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
