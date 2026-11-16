import Link from 'next/link';
import { headers } from 'next/headers';
import { ORGANIZER_CALLBACK_HEADER, safeCallbackUrl } from '@/auth/callback-url';
import { signOutOrganizer } from '@/auth/sign-out';
import { StateCard } from '@/components/state-card';
import type { CatalogLocale } from '@/i18n/config';
import { getServerTranslator } from '@/i18n/server';
import type { ServiceError } from '@/lib/errors';

/** The tab title of an organizer page whose signup can't be loaded, in `locale`. */
export function signupNotFoundTitle(locale: CatalogLocale): string {
  return getServerTranslator(locale, 'organizer.loadError')('tabTitle');
}

/**
 * The card an organizer page shows when its signup can't be loaded, in
 * `locale`, the organizer app's language for the organizer looking
 * (`getOrganizerAppLocale`). The server's "signup not found" is written for
 * API callers. Not found reads the same for a deleted signup, a made-up id
 * and a signup in someone else's workspace, so the page never says which it
 * was. Being signed in with another email than the one that owns the signup
 * is the likeliest cause a person can fix, so not found names the account and
 * offers to switch, coming back to this page after sign-in.
 */
export function SignupLoadError({
  error,
  email,
  locale,
}: {
  error: ServiceError;
  email: string;
  locale: CatalogLocale;
}) {
  const t = getServerTranslator(locale, 'organizer.loadError');
  const notFound = error.code === 'not_found';

  // "/login" would bounce a signed-in organizer straight back to /app, so
  // switching signs this one out first. The action posts to this page, so
  // the middleware's header names it.
  async function switchAccount() {
    'use server';
    const back = safeCallbackUrl((await headers()).get(ORGANIZER_CALLBACK_HEADER));
    await signOutOrganizer(`/login?callbackUrl=${encodeURIComponent(back)}`);
  }

  return (
    <StateCard
      title={notFound ? t('notFound.title') : t('failed.title')}
      className="mx-auto max-w-[560px]"
      body={
        notFound
          ? t.rich('notFound.body', {
              email,
              account: (chunks) => <span className="break-all font-medium text-ink">{chunks}</span>,
            })
          : t('failed.body')
      }
    >
      <div className="flex flex-col items-center gap-3 pt-2 sm:flex-row sm:justify-center sm:gap-5">
        <Link
          href="/app"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-hover"
        >
          {t('goToSignups')}
        </Link>
        {notFound ? (
          <form action={switchAccount}>
            <button type="submit" className="text-sm text-brand underline">
              {t('switchAccount')}
            </button>
          </form>
        ) : null}
      </div>
    </StateCard>
  );
}
