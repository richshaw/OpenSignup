import Link from 'next/link';
import { headers } from 'next/headers';
import { ORGANIZER_CALLBACK_HEADER, safeCallbackUrl } from '@/auth/callback-url';
import { signOutOrganizer } from '@/auth/sign-out';
import { StateCard } from '@/components/state-card';
import type { ServiceError } from '@/lib/errors';

/**
 * Organizer-facing copy for a signup page that can't load. The server's
 * "signup not found" is written for API callers. Not found reads the same
 * for a deleted signup, a made-up id and a signup in someone else's
 * workspace, so the page never says which it was.
 */
export const SIGNUP_LOAD_ERROR = {
  notFound: {
    title: 'We can’t find this signup',
    body: 'It may have been deleted, or it may belong to a different account.',
  },
  failed: {
    title: 'We couldn’t open this signup',
    body: 'Something went wrong on our side. Reload the page to try again.',
  },
} as const;

/** The tab title of an organizer page whose signup can't be loaded. */
export const SIGNUP_NOT_FOUND_TITLE = 'Signup not found';

/**
 * The card an organizer page shows when its signup can't be loaded. Being
 * signed in with another email than the one that owns the signup is the
 * likeliest cause a person can fix, so not found names the account and offers
 * to switch, coming back to this page after sign-in.
 */
export function SignupLoadError({ error, email }: { error: ServiceError; email: string }) {
  const notFound = error.code === 'not_found';
  const copy = notFound ? SIGNUP_LOAD_ERROR.notFound : SIGNUP_LOAD_ERROR.failed;

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
      title={copy.title}
      className="mx-auto max-w-[560px]"
      body={
        notFound ? (
          <>
            {copy.body} You’re signed in as{' '}
            <span className="break-all font-medium text-ink">{email}</span>.
          </>
        ) : (
          copy.body
        )
      }
    >
      <div className="flex flex-col items-center gap-3 pt-2 sm:flex-row sm:justify-center sm:gap-5">
        <Link
          href="/app"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-hover"
        >
          Go to your signups
        </Link>
        {notFound ? (
          <form action={switchAccount}>
            <button type="submit" className="text-sm text-brand underline">
              Sign in with a different email
            </button>
          </form>
        ) : null}
      </div>
    </StateCard>
  );
}
