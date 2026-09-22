import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { signOut } from '@/auth/config';
import { getOrganizerSession } from '@/auth/session';
import { INSTANCE_NAME } from '@/lib/site-config';
import { OAUTH_COOKIES, OAUTH_SESSION_COOKIE_PATH } from '@/oauth/config';

export const metadata = {
  title: { default: 'Dashboard', template: `%s · ${INSTANCE_NAME}` },
};

export default async function OrganizerLayout({
  children,
  crumbs,
}: {
  children: React.ReactNode;
  crumbs: React.ReactNode;
}) {
  const session = await getOrganizerSession();
  if (!session) redirect('/login?callbackUrl=/app');

  async function handleSignOut() {
    'use server';
    // The OAuth authorization server keeps its own record of who is signed
    // in; drop it too so a later "connect an app" on this browser starts
    // from whoever signs in next, not from this organizer.
    const jar = await cookies();
    for (const name of [OAUTH_COOKIES.session, `${OAUTH_COOKIES.session}.sig`]) {
      jar.delete({ name, path: OAUTH_SESSION_COOKIE_PATH });
    }
    await signOut({ redirectTo: '/' });
  }

  return (
    <div className="min-h-[100svh] bg-surface">
      <header className="border-b border-surface-sunk bg-white">
        <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <nav
            aria-label="Breadcrumb"
            className="text-ink-muted flex min-w-0 items-center gap-2 text-sm"
          >
            <Link href="/app" className="text-ink font-semibold tracking-tight">
              OpenSignup
            </Link>
            {crumbs}
          </nav>
          <nav className="flex shrink-0 items-center gap-4">
            {/* The account itself is the way into settings; on narrow screens the
                address would not fit, so the link reads "Settings" there. */}
            <Link
              href="/app/settings"
              className="text-ink-muted hover:text-ink max-w-[16rem] truncate text-sm transition"
              title="Settings"
            >
              <span className="sm:hidden">Settings</span>
              <span className="hidden sm:inline">{session.email}</span>
            </Link>
            <form action={handleSignOut}>
              <button
                type="submit"
                className="text-ink-muted hover:text-ink text-sm transition"
              >
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
