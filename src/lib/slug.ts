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
