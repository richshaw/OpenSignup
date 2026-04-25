import Link from 'next/link';
import { getDb } from '@/db/client';
import { getOrganizerSession, toActor } from '@/auth/session';
import { listSignupsForWorkspace } from '@/services/signups';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Your signups' };

export default async function DashboardPage() {
  const session = await getOrganizerSession();
  if (!session) redirect('/login');
  const actor = toActor(session);
  const workspaceId = session.defaultWorkspaceId;
  if (!workspaceId) {
    return (
      <div className="rounded-xl border border-surface-sunk bg-white p-8">
        <h1 className="mb-2 text-2xl font-semibold">Welcome to Signup</h1>
        <p className="text-ink-muted">
          Your workspace isn&apos;t set up yet. Sign out and back in to finish provisioning.
        </p>
      </div>
    );
  }
  const result = await listSignupsForWorkspace(getDb(), actor, workspaceId);
  const rows = result.ok ? result.value : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your signups</h1>
          <p className="text-ink-muted text-sm">
            {rows.length === 0 ? 'No signups yet — start one below.' : `${rows.length} total`}
          </p>
        </div>
        <Link
          href="/app/signups/new"
          className="bg-brand rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
        >
          New signup
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-sunk bg-white p-12 text-center">
          <p className="text-ink-muted">
            Coordinate snacks, carpool, potluck, volunteer shifts, or anything else.
          </p>
          <Link
            href="/app/signups/new"
            className="bg-brand mt-4 inline-flex items-center rounded-lg px-5 py-3 font-medium text-white transition hover:brightness-110"
          >
            Create your first signup
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-surface-sunk overflow-hidden rounded-xl border border-surface-sunk bg-white">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/app/signups/${r.id}`}
                className="block px-5 py-4 transition hover:bg-surface"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.title}</p>
                    <p className="text-ink-muted truncate text-sm">/s/{r.slug}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.status === 'open'
                        ? 'bg-success/10 text-success'
                        : r.status === 'draft'
                          ? 'bg-warn/10 text-warn'
                          : 'bg-ink-soft/10 text-ink-muted'
                    }`}
                  >
                    {r.status}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
