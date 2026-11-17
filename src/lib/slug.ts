import { randomInt } from 'node:crypto';
import { toKebab } from './kebab';

const CROCKFORD = '0123456789abcdefghjkmnpqrstvwxyz';
const SUFFIX_LENGTH = 5;
const MAX_BASE_LENGTH = 60;

function randomSuffix(): string {
  let out = '';
  for (let i = 0; i < SUFFIX_LENGTH; i++) {
    out += CROCKFORD[randomInt(CROCKFORD.length)];
  }
  return out;
}

const SUFFIX = new RegExp(`-[${CROCKFORD}]{${SUFFIX_LENGTH}}$`);

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
}

export function toSlug(input: string, opts: SlugOptions = {}): string {
  const { suffix = false, fallback = 'signup' } = opts;
  let base = toKebab(input);
  if (!base) base = fallback;
  if (base.length > MAX_BASE_LENGTH) base = base.slice(0, MAX_BASE_LENGTH).replace(/-+$/, '');
  if (!suffix) return base;
  return `${base}-${randomSuffix()}`;
}

/**
 * The slug with any punctuation typed straight after a pasted link taken off
 * its end ("…/s/team-snacks-a7vc8." reads as "team-snacks-a7vc8"). A slug only
 * holds a-z, 0-9 and "-" (`toSlug`), so nothing else at its end can be part
 * of one. Only the end: a stray character in the middle is left as it is.
 */
export function trimSlugTail(slug: string): string {
  return slug.replace(/[^a-z0-9-]+$/, '');
}
