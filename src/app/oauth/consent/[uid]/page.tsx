import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getOrganizerSession } from '@/auth/session';
import { signOutOrganizer } from '@/auth/sign-out';
import { CenteredPageFrame } from '@/components/centered-page-frame';
import type { CatalogLocale } from '@/i18n/config';
import { getOrganizerAppLocale } from '@/i18n/organizer';
import { getServerTranslator } from '@/i18n/server';
import { INSTANCE_NAME } from '@/lib/site-config';
import { consentPath, isInteractionUid } from '@/oauth/config';
import { ConsentUnavailable, loadConsentContext, type ConsentContext } from '@/oauth/consent';
import { ConsentForm } from './consent-form';

/**
 * The organizer is signed in by the time they get here, so the page is in
 * their language (`getOrganizerAppLocale`), and so is the page saying a
 * request has run out. The app's name and domain are shown as its metadata
 * gives them.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = getServerTranslator(getOrganizerAppLocale(await getOrganizerSession()), 'auth.consent');
  return { title: t('tabTitle'), robots: { index: false } };
}
export const dynamic = 'force-dynamic';

export default async function ConsentPage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  const session = await getOrganizerSession();
  const locale = getOrganizerAppLocale(session);
  if (!isInteractionUid(uid)) return <Unavailable locale={locale} />;
  if (!session) redirect(`/login?callbackUrl=${encodeURIComponent(consentPath(uid))}`);

  let ctx: ConsentContext;
  try {
    ctx = await loadConsentContext(uid);
  } catch (err) {
    if (err instanceof ConsentUnavailable) return <Unavailable locale={locale} />;
    throw err;
  }

  const t = getServerTranslator(locale, 'auth.consent');
  const describe = getServerTranslator(locale, 'auth.scopes');
  const strong = (chunks: ReactNode) => <strong className="text-ink">{chunks}</strong>;
  const { domain, name } = ctx.client;

  // Every organizer starts with one personal workspace, and the app never
  // shows workspaces, so a name here would mean nothing to them. Only mention
  // workspaces when there is more than one to reach.
  const workspaceCount = session.memberships.length;

  // "/login" would bounce a signed-in organizer straight back to /app, so
  // switching accounts has to sign this one out first — and keep the
  // pending consent as the place to come back to. The provider's own
  // session cookie goes too, so the next organizer's decision is theirs.
  async function switchAccount() {
    'use server';
    await signOutOrganizer(`/login?callbackUrl=${encodeURIComponent(consentPath(uid))}`);
  }

  return (
    <CenteredPageFrame header gap="gap-8" padding="py-8" locale={locale}>
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">{t('request')}</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {t.rich('heading', {
            domain,
            instance: INSTANCE_NAME,
            host: (chunks) => <span className="break-all">{chunks}</span>,
          })}
        </h1>
        <p className="text-ink-muted">
          {ctx.client.isUrl
            ? name
              ? t.rich('fromNamedApp', { name, domain, strong })
              : t.rich('fromApp', { domain, strong })
            : t.rich('setUpBySite', { name: name ?? domain, strong })}
        </p>
      </div>

      <section aria-labelledby="permissions-heading" className="space-y-3">
        <h2
          id="permissions-heading"
          className="text-sm font-semibold uppercase tracking-wide text-ink-soft"
        >
          {t('permissions')}
        </h2>
        <ul className="divide-y divide-surface-sunk rounded-xl border border-surface-sunk bg-white">
          {ctx.permissions.map((p) => (
            <li key={p.scope} className="flex gap-3 px-4 py-3">
              <span aria-hidden="true" className={p.sensitive ? 'text-warn' : 'text-success'}>
                {p.sensitive ? '!' : '✓'}
              </span>
              <div className="space-y-1">
                <p className={p.sensitive ? 'font-medium text-warn' : 'font-medium'}>
                  {describe(p.message)}
                </p>
                {p.sensitive ? (
                  <p className="text-sm text-ink-muted">{t('sensitive', { domain })}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        <p className="text-sm text-ink-muted">
          {t.rich('actsAs', {
            workspaces: workspaceCount > 1 ? 'many' : 'one',
            email: session.email,
            strong,
          })}
        </p>
      </section>

      <ConsentForm
        action={`${consentPath(uid)}/decision`}
        text={{
          allow: t('allow'),
          allowing: t('allowing'),
          deny: t('deny'),
          denying: t('denying'),
        }}
      />

      <div className="text-sm text-ink-soft">
        {t.rich('disconnect', {
          link: (chunks) => (
            <Link href="/app/settings/connected-apps" className="underline">
              {chunks}
            </Link>
          ),
        })}{' '}
        {t('notYou')}{' '}
        <form action={switchAccount} className="inline">
          <button type="submit" className="underline">
            {t('switchAccount')}
          </button>
        </form>
      </div>
    </CenteredPageFrame>
  );
}

function Unavailable({ locale }: { locale: CatalogLocale }) {
  const t = getServerTranslator(locale, 'auth.consent.expired');
  return (
    <CenteredPageFrame locale={locale}>
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">{t('heading')}</h1>
        <p className="text-ink-muted">{t('body')}</p>
      </div>
      <Link href="/app" className="text-sm text-ink-muted underline">
        {t('dashboard')}
      </Link>
    </CenteredPageFrame>
  );
}
