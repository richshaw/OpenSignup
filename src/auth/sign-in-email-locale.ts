import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { organizers } from '@/db/schema/organizers';
import type { CatalogLocale } from '@/i18n/config';
import { getOrganizerAppLocale } from '@/i18n/organizer';

/**
 * The sign-in email's language: the language the organizer app shows the
 * account at `email` (`getOrganizerAppLocale`), so the email reads like the
 * screens it signs in to. That's the language stored on the account once it
 * has shipped to organizers, else the instance's `DEFAULT_LOCALE` once that
 * has, else English. An address with no account gets what an account with
 * none stored gets, the language of the sign-in pages (`signInLocale`).
 * `email` is normalized, as accounts store it.
 *
 * `sendVerificationRequest` (./config.ts) calls this only once the request
 * has been charged to the magic-link rate limits, so a request they refuse
 * reads nothing. Nothing tells the requester whether an account exists: the
 * read runs whether or not there is one, it's one row by a unique index
 * either way, and what it finds changes only the email's words, which only
 * whoever reads that inbox sees. Nothing is logged.
 */
export async function signInEmailLocale(db: Db, email: string): Promise<CatalogLocale> {
  const [account] = await db
    .select({ locale: organizers.locale })
    .from(organizers)
    .where(eq(organizers.email, email))
    .limit(1);
  return getOrganizerAppLocale(account ?? null);
}
