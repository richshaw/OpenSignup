import { headers } from 'next/headers';
import { type CatalogLocale, defaultFor, signupLocale } from '@/i18n/config';
import { instanceDefaultLocale } from '@/i18n/server';
import { SIGNUP_PATH_HEADER, slugFromSignupPath } from '@/lib/signup-path';
import { loadSignupRowBySlug } from '@/services/signups.cached';

/**
 * The language of the signup at `slug`, for a page that can't show the signup
 * itself: a draft, an archived one, or a not-found page. Read through the
 * same cached row as `loadPublicSignup`, so on the signup page it costs no
 * statement, and only the language leaves here: that row holds the signup's
 * title, description and settings, which a visitor must never see. A deleted
 * or unknown slug has no row, so it reads as the instance's language for
 * participants.
 */
export async function signupLocaleForSlug(slug: string): Promise<CatalogLocale> {
  const row = await loadSignupRowBySlug(slug);
  return signupLocale(row?.settings.locale, instanceDefaultLocale());
}

/**
 * The language of the signup whose path was requested, for a page that gets
 * no params: the not-found pages under `/s/[slug]`. The slug comes from the
 * path header the middleware sets (`SIGNUP_PATH_HEADER`); a path with no slug
 * in it reads as the instance's language for participants, without a lookup.
 *
 * Next renders a segment's not-found page on every request under it, not only
 * on a 404, so this runs on every signup, edit and unsubscribe page. The slug
 * is the one the signup page reads, so there it shares that page's cached
 * read; the edit and unsubscribe pages read by token, so it is one statement
 * there.
 */
export async function requestedSignupLocale(): Promise<CatalogLocale> {
  const slug = slugFromSignupPath((await headers()).get(SIGNUP_PATH_HEADER));
  return slug === null
    ? defaultFor('participant', instanceDefaultLocale())
    : signupLocaleForSlug(slug);
}
