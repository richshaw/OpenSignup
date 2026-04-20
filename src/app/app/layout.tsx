import Link from 'next/link';
import { redirect } from 'next/navigation';
import { signOut } from '@/auth/config';
import { getOrganizerSession } from '@/auth/session';

export const metadata = { title: { default: 'Dashboard', template: '%s · Signup' } };

export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const session = await getOrganizerSession();
  if (!session) redirect('/login?callbackUrl=/app');

  async function handleSignOut() {
    'use server';
    await signOut({ redirectTo: '/' });
  }

  return (
    <div className="min-h-[100svh] bg-surface">
      <header className="border-b border-surface-sunk bg-white">
        <div className="mx-auto flex w-full max-w-[1100px] items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/app" className="font-semibold tracking-tight">
            Signup
          </Link>
          <nav className="flex items-center gap-4">
            <span className="text-ink-muted hidden text-sm sm:inline">{session.email}</span>
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
