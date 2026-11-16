import type { Metadata } from 'next';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getOrganizerSession, requireOrganizerSession, toActor } from '@/auth/session';
import { FormError, SuccessNotice } from '@/components/ui/form-error';
import { getDb } from '@/db/client';
import { getOrganizerAppLocale } from '@/i18n/organizer';
import { getServerTranslator } from '@/i18n/server';
import { ServiceException } from '@/lib/errors';
import { accessTokenLifetime } from '@/lib/lifetimes';
import { log } from '@/lib/log';
import { listConnectedApps, revokeConnectedApp } from '@/oauth/grants';
import { getProvider } from '@/oauth/instance';
import { SCOPE_DESCRIPTIONS } from '@/oauth/scopes';
import { DisconnectButton } from './disconnect-button';
import { disconnectRefusal } from './disconnect-refusal';
import { formatGrantDate } from './grant-date';

export async function generateMetadata(): Promise<Metadata> {
  const locale = getOrganizerAppLocale(await getOrganizerSession());
  return { title: getServerTranslator(locale, 'organizer.connectedApps')('title') };
}
export const dynamic = 'force-dynamic';

const PATH = '/app/settings/connected-apps';

/** Between an app's domain and the name it gives itself: a mark, the same in every language. */
const NAME_SEPARATOR = ' · ';

export default async function ConnectedAppsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; disconnected?: string }>;
}) {
  const { error, disconnected } = await searchParams;
  const session = await requireOrganizerSession();
  const actor = toActor(session);
  const apps = await listConnectedApps(getDb(), actor);
  const locale = getOrganizerAppLocale(session);
  const t = getServerTranslator(locale, 'organizer.connectedApps');
  const lifetime = accessTokenLifetime(locale);
  const refusal = disconnectRefusal(getServerTranslator(locale, 'organizer.errors'), error);

  async function disconnect(formData: FormData) {
    'use server';
    const grantId = String(formData.get('grantId') ?? '');
    const current = await requireOrganizerSession();
    try {
      await revokeConnectedApp(getDb(), await getProvider(), toActor(current), grantId);
    } catch (err) {
      // The refusal's code, or `internal` for anything else, which the page words.
      if (err instanceof ServiceException) redirect(`${PATH}?error=${err.serviceError.code}`);
      log.error({ err }, 'connected-apps: disconnect failed');
      redirect(`${PATH}?error=internal`);
    }
    revalidatePath(PATH);
    redirect(`${PATH}?disconnected=1`);
  }

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-ink-muted">{t('intro')}</p>
      </div>

      {refusal ? <FormError>{refusal}</FormError> : null}
      {disconnected ? <SuccessNotice>{t('disconnected', { lifetime })}</SuccessNotice> : null}

      {apps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-sunk px-6 py-10 text-center">
          <p className="font-medium">{t('empty.title')}</p>
          <p className="mt-1 text-sm text-ink-muted">{t('empty.body')}</p>
        </div>
      ) : (
        <ul className="divide-y divide-surface-sunk rounded-xl border border-surface-sunk bg-white">
          {apps.map((app) => (
            <li
              key={app.grantId}
              className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <p className="font-medium">
                  <span className="break-all">{app.client.domain}</span>
                  {app.client.name ? (
                    <span className="font-normal text-ink-muted">
                      {NAME_SEPARATOR}
                      {app.client.name}
                    </span>
                  ) : null}
                </p>
                <ul className="text-sm text-ink-muted">
                  {app.scopes.map((s) => (
                    <li key={s}>{SCOPE_DESCRIPTIONS[s]}</li>
                  ))}
                </ul>
                <p className="text-xs text-ink-soft">
                  {t('dates', {
                    approved: formatGrantDate(app.approvedAt, locale),
                    used: app.lastUsedAt ? 'yes' : 'no',
                    lastUsed: app.lastUsedAt ? formatGrantDate(app.lastUsedAt, locale) : '',
                    expiring: app.expiresAt ? 'yes' : 'no',
                    expires: app.expiresAt ? formatGrantDate(app.expiresAt, locale) : '',
                  })}
                </p>
              </div>
              <form action={disconnect} className="shrink-0">
                <input type="hidden" name="grantId" value={app.grantId} />
                <DisconnectButton label={t('disconnect')} loadingLabel={t('disconnecting')} />
              </form>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-ink-soft">{t('footnote', { lifetime })}</p>
    </section>
  );
}
