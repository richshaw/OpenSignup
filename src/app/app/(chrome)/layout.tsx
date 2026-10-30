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
            className="text-ink-muted flex min-w-0 items-center gap-2 text-sm"
          >
            <Link href="/app" className="text-ink font-semibold tracking-tight">
              OpenSignup
            </Link>
            {crumbs}
          </nav>
          <nav className="flex shrink-0 items-center gap-4">
            <Link href="/help" className="text-ink-muted hover:text-ink text-sm transition">
              Help
            </Link>
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
