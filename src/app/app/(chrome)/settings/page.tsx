import Link from 'next/link';
import { getOrganizerSession } from '@/auth/session';

export const metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

/**
 * The settings hub the account link in the header opens. One section today;
 * the list is the place the next ones (profile, workspaces, notifications)
 * go, so each is a card with a name and a one-line description rather than
 * a bare link.
 */
const SECTIONS = [
  {
    href: '/app/settings/connected-apps',
    title: 'Connected apps',
    description: 'AI assistants and other apps you have allowed to use your account, and how to disconnect them.',
  },
] as const;

export default async function SettingsPage() {
  const session = await getOrganizerSession();
  if (!session) return null;

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-ink-muted text-sm">
          Signed in as <span className="text-ink font-medium">{session.email}</span>.
        </p>
      </div>
      <ul className="divide-y divide-surface-sunk rounded-xl border border-surface-sunk bg-white">
        {SECTIONS.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-raised"
            >
              <span className="space-y-1">
                <span className="block font-medium">{s.title}</span>
                <span className="text-ink-muted block text-sm">{s.description}</span>
              </span>
              <span aria-hidden="true" className="text-ink-soft shrink-0">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
