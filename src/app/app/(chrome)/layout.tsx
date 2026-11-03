import Link from 'next/link';
import { requireOrganizerSession } from '@/auth/session';
import { signOutOrganizer } from '@/auth/sign-out';
import { INSTANCE_NAME } from '@/lib/site-config';

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
  const session = await requireOrganizerSession();

  async function handleSignOut() {
    'use server';
    await signOutOrganizer('/');
  }

  return (
    <div className="min-h-[100svh] bg-surface">
      <header className="border-b border-surface-sunk bg-white">
        <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <nav
            aria-label="Breadcrumb"
            className="flex min-w-0 items-center gap-2 text-sm text-ink-muted"
          >
            <Link href="/app" className="font-semibold tracking-tight text-ink">
              OpenSignup
            </Link>
            {crumbs}
          </nav>
          <nav className="flex shrink-0 items-center gap-4">
            <Link href="/help" className="text-sm text-ink-muted transition hover:text-ink">
              Help
            </Link>
            {/* The account itself is the way into settings; on narrow screens the
                address would not fit, so the link reads "Account" there, not
                "Settings", which a signup's own tab is called. */}
            <Link
              href="/app/settings"
              className="max-w-[16rem] truncate text-sm text-ink-muted transition hover:text-ink"
              title="Settings"
            >
              <span className="sm:hidden">Account</span>
              <span className="hidden sm:inline">{session.email}</span>
            </Link>
            <form action={handleSignOut}>
              <button type="submit" className="text-sm text-ink-muted transition hover:text-ink">
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
