import { cache } from 'react';
import { getDb } from '@/db/client';
import type { Actor } from '@/lib/policy';
import { ok } from '@/lib/result';
import { committedBySlot } from '@/services/commitments';
import { getPublicSignup, getSignupForOrganizer } from '@/services/signups';

export const loadSignupForOrganizer = cache(async (actor: Actor, signupId: string) => {
  return getSignupForOrganizer(getDb(), actor, signupId);
});

/**
 * Spots taken per slot, for a page that already loads the signup through
 * `loadSignupForOrganizer`. It goes through that same cached read, so the
 * policy guard runs and the signup isn't read twice, and counts only once
 * the read has succeeded.
 */
export const loadCommittedBySlotForOrganizer = cache(async (actor: Actor, signupId: string) => {
  const loaded = await loadSignupForOrganizer(actor, signupId);
  if (!loaded.ok) return loaded;
  return ok(await committedBySlot(getDb(), loaded.value.id));
});

export const loadPublicSignup = cache(async (slug: string) => {
  return getPublicSignup(getDb(), slug);
});
