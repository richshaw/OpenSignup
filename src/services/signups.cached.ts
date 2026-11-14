import { cache } from 'react';
import { getDb } from '@/db/client';
import { ServiceException, serviceError } from '@/lib/errors';
import type { Actor } from '@/lib/policy';
import { err, ok } from '@/lib/result';
import { committedBySlot } from '@/services/commitments';
import { getPublicSignup, getSignupForOrganizer, getSignupRowBySlug } from '@/services/signups';

/**
 * The signup an organizer page shows. A signup in a workspace the organizer
 * isn't in comes back as not found, the same as an id that doesn't exist:
 * the policy guard throws `forbidden`, which a page would otherwise turn into
 * a server error, and the page shouldn't say whether that id exists in
 * someone else's workspace. The REST API and MCP tools still answer 403.
 */
export const loadSignupForOrganizer = cache(async (actor: Actor, signupId: string) => {
  try {
    return await getSignupForOrganizer(getDb(), actor, signupId);
  } catch (e) {
    if (e instanceof ServiceException && e.serviceError.code === 'forbidden') {
      return err(serviceError('not_found', 'signup not found'));
    }
    throw e;
  }
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

/**
 * The live signup at `slug` as stored (`getSignupRowBySlug`), read once per
 * request however many server components ask for it: `loadPublicSignup` gets
 * its row here, so a layout reading the row as well adds no statement.
 */
export const loadSignupRowBySlug = cache(async (slug: string) => {
  return getSignupRowBySlug(getDb(), slug);
});

/**
 * The public page's signup (`getPublicSignup`), shared by its metadata and the
 * page. It gets the row through `loadSignupRowBySlug`, never by slug, so the
 * signup is read once per request; `signups.cached.test.ts` checks that.
 */
export const loadPublicSignup = cache(async (slug: string) => {
  return getPublicSignup(getDb(), await loadSignupRowBySlug(slug));
});
