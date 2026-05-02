import { cache } from 'react';
import { getDb } from '@/db/client';
import type { Actor } from '@/lib/policy';
import { getPublicSignup, getSignupForOrganizer } from '@/services/signups';

export const loadSignupForOrganizer = cache(async (actor: Actor, signupId: string) => {
  return getSignupForOrganizer(getDb(), actor, signupId);
});

export const loadPublicSignup = cache(async (slug: string) => {
  return getPublicSignup(getDb(), slug);
});
