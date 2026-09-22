import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getOrganizerSession, toActor } from '@/auth/session';
import { getDb } from '@/db/client';
import { ServiceException } from '@/lib/errors';
import { log } from '@/lib/log';
import { OAUTH_TTL } from '@/oauth/config';
import { listConnectedApps, revokeConnectedApp } from '@/oauth/grants';
import { getProvider } from '@/oauth/instance';
import { SCOPE_DESCRIPTIONS } from '@/oauth/scopes';
import { DisconnectButton } from './disconnect-button';

export const metadata = { title: 'Connected apps' };
export const dynamic = 'force-dynamic';

const PATH = '/app/settings/connected-apps';

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function ConnectedAppsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; disconnected?: string }>;
}) {
  const { error, disconnected } = await searchParams;
  const session = await getOrganizerSession();
  if (!session) redirect(`/login?callbackUrl=${PATH}`);
  const actor = toActor(session);
  const apps = await listConnectedApps(getDb(), actor);
  const residualMinutes = Math.round(OAUTH_TTL.ACCESS_TOKEN / 60);

  async function disconnect(formData: FormData) {
    'use server';
    const grantId = String(formData.get('grantId') ?? '');
    const current = await getOrganizerSession();
    if (!current) redirect('/login');
    try {
      await revokeConnectedApp(getDb(), await getProvider(), toActor(current), grantId);
    } catch (err) {
      if (err instanceof ServiceException) {
        redirect(`${PATH}?error=${encodeURIComponent(err.serviceError.message)}`);
      }
      log.error({ err }, 'connected-apps: disconnect failed');
      redirect(`${PATH}?error=${encodeURIComponent('Could not disconnect. Try again.')}`);
    }
    revalidatePath(PATH);
    redirect(`${PATH}?disconnected=1`);
  }

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Connected apps</h1>
        <p className="text-ink-muted text-sm">
          Apps and AI assistants you have allowed to use your account. Each one acts as you, in every
          workspace you belong to, with the permissions you approved.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {disconnected ? (
        <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
          Disconnected. It can no longer get new access, and any access it still holds ends within{' '}
          {residualMinutes} minutes.
        </p>
      ) : null}

      {apps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-sunk px-6 py-10 text-center">
          <p className="font-medium">No connected apps</p>
          <p className="text-ink-muted mt-1 text-sm">
            When you connect an AI assistant such as Claude or ChatGPT to your account, it will show
            up here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-surface-sunk rounded-xl border border-surface-sunk bg-white">
          {apps.map((app) => (
            <li key={app.grantId} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="font-medium">
                  <span className="break-all">{app.client.domain}</span>
                  {app.client.name ? (
                    <span className="text-ink-muted font-normal"> · {app.client.name}</span>
                  ) : null}
                </p>
                <ul className="text-ink-muted text-sm">
                  {app.scopes.map((s) => (
                    <li key={s}>{SCOPE_DESCRIPTIONS[s]}</li>
                  ))}
                </ul>
                <p className="text-ink-soft text-xs">
                  Approved {formatDate(app.approvedAt)}
                  {app.lastUsedAt ? ` · last used ${formatDate(app.lastUsedAt)}` : ' · not used yet'}
                  {app.expiresAt ? ` · expires ${formatDate(app.expiresAt)} unless renewed` : ''}
                </p>
              </div>
              <form action={disconnect} className="shrink-0">
                <input type="hidden" name="grantId" value={app.grantId} />
                <DisconnectButton />
              </form>
            </li>
          ))}
        </ul>
      )}

      <p className="text-ink-soft text-xs">
        Disconnecting stops an app from getting new access straight away. Access it already holds
        expires on its own within {residualMinutes} minutes and cannot be cut short.
      </p>
    </section>
  );
}
