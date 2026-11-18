import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/db/client';
import { getOrganizerSession, requireOrganizerSession, toActor } from '@/auth/session';
import { langWhereDifferent } from '@/i18n/config';
import { getServerTranslator } from '@/i18n/server';
import { localeOfOrganizer, localeOfSignup } from '@/i18n/locale';
import { publicSignupPath } from '@/lib/links';
import { listSignupSummariesForWorkspace } from '@/services/signups';
import { StatusPill } from '@/components/status-pill';
import { signupStatusLabel } from '@/components/signup/status-label';
import type { SignupStatus } from '@/schemas/signups';
import { INSTANCE_NAME } from '@/lib/site-config';
import { signupTabPath } from '@/lib/organizer-paths';

export async function generateMetadata(): Promise<Metadata> {
  const locale = localeOfOrganizer(await getOrganizerSession());
  return { title: getServerTranslator(locale, 'organizer.dashboard')('title') };
}

export default async function DashboardPage() {
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
  const result = await listSignupSummariesForWorkspace(getDb(), actor, workspaceId);
  const rows = result.ok ? result.value : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-ink-muted">
            {rows.length === 0 ? t('none') : t('total', { count: rows.length })}
          </p>
        </div>
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
        <ul className="divide-y divide-surface-sunk overflow-hidden rounded-xl border border-surface-sunk bg-white">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={signupTabPath(r.id, 'build')}
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
      )}
    </div>
  );
}
