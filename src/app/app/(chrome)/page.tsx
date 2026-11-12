import Link from 'next/link';
import { getDb } from '@/db/client';
import { requireOrganizerSession, toActor } from '@/auth/session';
import { countSignupsForWorkspace, listSignupSummaryPageForWorkspace } from '@/services/signups';
import { DRAFT_ONLY_YOU } from '@/components/signup/draft-copy';
import { StatusPill } from '@/components/status-pill';
import { olderSignupsHref, parseBefore, signupCountLabel } from './dashboard-paging';

export const metadata = { title: 'Your signups' };

type PageProps = { searchParams: Promise<{ before?: string | string[] }> };

export default async function DashboardPage({ searchParams }: PageProps) {
  const session = await requireOrganizerSession();
  const actor = toActor(session);
  const workspaceId = session.defaultWorkspaceId;
  if (!workspaceId) {
    return (
      <div className="rounded-xl border border-surface-sunk bg-white p-8">
        <h1 className="mb-2 text-2xl font-semibold">Welcome to OpenSignup</h1>
        <p className="text-ink-muted">
          Your workspace isn&apos;t set up yet. Sign out and back in to finish provisioning.
        </p>
      </div>
    );
  }
  const db = getDb();
  const requested = parseBefore((await searchParams).before);
  const [pageResult, countResult] = await Promise.all([
    listSignupSummaryPageForWorkspace(db, actor, workspaceId, { before: requested }),
    countSignupsForWorkspace(db, actor, workspaceId),
  ]);
  let page = pageResult.ok ? pageResult.value : { rows: [], nextBefore: null };
  let before = requested;
  // A `before` that names no signup here (another workspace's, or made up)
  // finds nothing: show the first page instead of an empty one.
  if (before && page.rows.length === 0) {
    before = undefined;
    const first = await listSignupSummaryPageForWorkspace(db, actor, workspaceId);
    if (first.ok) page = first.value;
  }
  const { rows } = page;
  const total = countResult.ok ? countResult.value : rows.length;
  const olderHref = olderSignupsHref(page.nextBefore);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your signups</h1>
          <p className="text-sm text-ink-muted">{signupCountLabel(total)}</p>
        </div>
        <Link
          href="/app/signups/new"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-hover"
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
            className="mt-4 inline-flex items-center rounded-lg bg-brand px-5 py-3 font-medium text-white transition hover:bg-brand-hover"
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
                    {/* A draft's address only says it isn't ready yet, so there's
                        nothing to send until it's published. */}
                    {r.status === 'draft' ? (
                      <p className="truncate text-sm text-ink-muted">{DRAFT_ONLY_YOU}</p>
                    ) : (
                      <p className="truncate font-mono text-sm text-ink-muted">/s/{r.slug}</p>
                    )}
                  </div>
                  <StatusPill status={r.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {olderHref || before ? (
        <nav aria-label="More signups" className="flex flex-wrap justify-between gap-4 text-sm">
          {before ? (
            <Link href="/app" className="font-medium text-brand hover:underline">
              Back to newest signups
            </Link>
          ) : (
            <span />
          )}
          {olderHref ? (
            <Link href={olderHref} className="font-medium text-brand hover:underline">
              Show older signups
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
