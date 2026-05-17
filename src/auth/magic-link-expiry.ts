import { getEnv } from '@/lib/env';

export function getMagicLinkMaxAgeMinutes(): number {
  return getEnv().AUTH_MAGIC_LINK_MAX_AGE_MINUTES;
}

export function getMagicLinkMaxAgeSeconds(): number {
  return getMagicLinkMaxAgeMinutes() * 60;
}
