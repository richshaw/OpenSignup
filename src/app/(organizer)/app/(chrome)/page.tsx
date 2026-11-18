import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/db/client';
import { getOrganizerSession, requireOrganizerSession, toActor } from '@/auth/session';
import { langWhereDifferent } from '@/i18n/config';
import { getServerTranslator } from '@/i18n/server';
import { localeOfOrganizer, localeOfSignup } from '@/i18n/locale';
import { publicSignupPath } from '@/lib/links';
import { countSignupsForWorkspace, listSignupSummaryPageForWorkspace } from '@/services/signups';
import { StatusPill } from '@/components/status-pill';
import { signupStatusLabel } from '@/components/signup/status-label';
import type { SignupStatus } from '@/schemas/signups';
import { INSTANCE_NAME } from '@/lib/site-config';
import { DashboardPager } from './dashboard-pager';
import { newerSignupsHref, olderSignupsHref, parseCursor, signupRange } from './dashboard-paging';

export async function generateMetadata(): Promise<Metadata> {
  const locale = localeOfOrganizer(await getOrganizerSession());
  return { title: getServerTranslator(locale, 'organizer.dashboard')('title') };
}

type PageProps = {
  searchParams: Promise<{ before?: string | string[]; after?: string | string[] }>;
};

export default async function DashboardPage({ searchParams }: PageProps) {
  const session = await requireOrganizerSession();
  const locale = localeOfOrganizer(session);
  const t = getServerTranslator(locale, 'organizer.dashboard');
  const tStatus = getServerTranslator(locale, 'organizer.status');
  const actor = toActor(session);
  const workspaceId = session.defaultWorkspaceId;
  if (!workspaceId) {
    return (
      <div className="rounded-xl border border-surface-sunk bg-white p-8">
        <h1 className="mb-2 text-2xl font-semibold">
          {t('noWorkspace.title', { instance: INSTANCE_NAME })}
        </h1>
        <p className="text-ink-muted">{t('noWorkspace.body')}</p>
      </div>
    );
  }
  const db = getDb();
  const cursor = parseCursor(await searchParams);
  const pageResult = await listSignupSummaryPageForWorkspace(db, actor, workspaceId, cursor ?? {});
  let page = pageResult.ok
    ? pageResult.value
    : { rows: [], offset: 0, nextBefore: null, prevAfter: null };
  // A cursor that names no signup here (another workspace's, or made up), or
  // one with nothing past it, finds nothing: show the first page instead of
  // an empty one.
  if (cursor && page.rows.length === 0) {
    const first = await listSignupSummaryPageForWorkspace(db, actor, workspaceId);
    if (first.ok) page = first.value;
  }
  const { rows } = page;
  const newerHref = newerSignupsHref(page.prevAfter, page.offset);
  const olderHref = olderSignupsHref(page.nextBefore);
  const paged = Boolean(newerHref || olderHref);
  // The total only shows in the pager's range, so a list that fits on one
  // page (most of them) doesn't count.
  const countResult = paged ? await countSignupsForWorkspace(db, actor, workspaceId) : null;
  const total = countResult?.ok ? countResult.value : page.offset + rows.length;
  const range = signupRange(page.offset, rows.length, total);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <Link
          href="/app/signups/new"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-hover"
        >
          {t('newSignup')}
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-sunk bg-white p-12 text-center">
          <p className="text-ink-muted">{t('emptyPitch')}</p>
          <Link
            href="/app/signups/new"
            className="mt-4 inline-flex items-center rounded-lg bg-brand px-5 py-3 font-medium text-white transition hover:bg-brand-hover"
          >
            {t('createFirst')}
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-surface-sunk bg-white">
          <ul className="divide-y divide-surface-sunk">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/app/signups/${r.id}/build`}
                  className="block px-5 py-4 transition hover:bg-surface"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      {/* A title is in its signup's language, which may not be the organizer's. */}
                      <p
                        lang={langWhereDifferent(localeOfSignup(r.locale), locale)}
                        className="truncate font-medium"
                      >
                        {r.title}
                      </p>
                      {/* A draft's address only says it isn't ready yet, so there's
                          nothing to send until it's published. */}
                      {r.status === 'draft' ? (
                        <p className="truncate text-sm text-ink-muted">{t('draftOnlyYou')}</p>
                      ) : (
                        <p className="truncate font-mono text-sm text-ink-muted">
                          {publicSignupPath(r.slug)}
                        </p>
                      )}
                    </div>
                    <StatusPill
                      status={r.status}
                      label={signupStatusLabel(r.status as SignupStatus, tStatus)}
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {paged ? (
            <DashboardPager
              label={t('pager.label')}
              range={t('pager.range', range)}
              newer={t('pager.newer')}
              older={t('pager.older')}
              newerHref={newerHref}
              olderHref={olderHref}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
