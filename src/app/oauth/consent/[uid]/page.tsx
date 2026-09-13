import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { signOut } from '@/auth/config';
import { getOrganizerSession } from '@/auth/session';
import { SiteFooter } from '@/components/site-footer';
import { INSTANCE_NAME } from '@/lib/site-config';
import { OAUTH_COOKIES, OAUTH_SESSION_COOKIE_PATH, consentPath, isInteractionUid } from '@/oauth/config';
import { ConsentUnavailable, loadConsentContext, type ConsentContext } from '@/oauth/consent';
import { ConsentForm } from './consent-form';

export const metadata = { title: 'Connect an app', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function ConsentPage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  if (!isInteractionUid(uid)) return <Unavailable />;
  const session = await getOrganizerSession();
  if (!session) redirect(`/login?callbackUrl=${encodeURIComponent(consentPath(uid))}`);

  let ctx: ConsentContext;
  try {
    ctx = await loadConsentContext(uid);
  } catch (err) {
    if (err instanceof ConsentUnavailable) return <Unavailable />;
    throw err;
  }

  const workspaceNames = session.memberships.map((m) => m.workspaceName);

  // "/login" would bounce a signed-in organizer straight back to /app, so
  // switching accounts has to sign this one out first — and keep the
  // pending consent as the place to come back to. The provider's own
  // session cookie goes too, so the next organizer's decision is theirs.
  async function switchAccount() {
    'use server';
    const jar = await cookies();
    for (const name of [OAUTH_COOKIES.session, `${OAUTH_COOKIES.session}.sig`]) {
      jar.delete({ name, path: OAUTH_SESSION_COOKIE_PATH });
    }
    await signOut({ redirectTo: `/login?callbackUrl=${encodeURIComponent(consentPath(uid))}` });
  }

  return (
    <div className="flex min-h-[100svh] flex-col">
      <header className="flex items-center justify-between px-5 py-5 lg:px-12 lg:py-6">
        <Link href="/" className="text-lg font-semibold tracking-tight lg:text-xl">
          {INSTANCE_NAME}
        </Link>
      </header>
      <main className="container-tight flex flex-1 flex-col justify-center gap-8 py-8">
        <div className="space-y-3">
          <p className="text-ink-muted text-sm">Connection request</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Allow <span className="break-all">{ctx.client.domain}</span> to use your {INSTANCE_NAME}{' '}
            account?
          </h1>
          <p className="text-ink-muted">
            {ctx.client.isUrl ? (
              <>
                {ctx.client.name ? (
                  <>
                    This app calls itself <strong className="text-ink">{ctx.client.name}</strong>.{' '}
                  </>
                ) : null}
                The request came from <strong className="text-ink">{ctx.client.domain}</strong>; that
                is the part it cannot fake.
              </>
            ) : (
              <>
                <strong className="text-ink">{ctx.client.name ?? ctx.client.domain}</strong> is an app
                the operator of this instance registered in advance.
              </>
            )}
          </p>
        </div>

        <section aria-labelledby="permissions-heading" className="space-y-3">
          <h2 id="permissions-heading" className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
            It will be able to
          </h2>
          <ul className="divide-y divide-surface-sunk rounded-xl border border-surface-sunk bg-white">
            {ctx.permissions.map((p) => (
              <li key={p.scope} className="flex gap-3 px-4 py-3">
                <span aria-hidden="true" className={p.sensitive ? 'text-warn' : 'text-success'}>
                  {p.sensitive ? '!' : '✓'}
                </span>
                <div className="space-y-1">
                  <p className={p.sensitive ? 'font-medium text-warn' : 'font-medium'}>{p.description}</p>
                  {p.sensitive ? (
                    <p className="text-sm text-ink-muted">
                      Participants gave these details to you, not to this app. Only approve if you
                      are comfortable with {ctx.client.domain} handling them.
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <p className="text-sm text-ink-muted">
            This covers {workspaceNames.length === 1 ? 'your workspace' : 'all your workspaces'}:{' '}
            <strong className="text-ink">{workspaceNames.join(', ') || 'none yet'}</strong>. It acts as{' '}
            <strong className="text-ink">{session.email}</strong>, with the same role you have in each
            workspace, and can never do more than you can.
          </p>
        </section>

        <ConsentForm action={`${consentPath(uid)}/decision`} />

        <div className="text-sm text-ink-soft">
          You can disconnect it at any time from{' '}
          <Link href="/app/settings/connected-apps" className="underline">
            Connected apps
          </Link>
          . Not you?{' '}
          <form action={switchAccount} className="inline">
            <button type="submit" className="underline">
              Sign in as someone else
            </button>
          </form>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function Unavailable() {
  return (
    <div className="flex min-h-[100svh] flex-col">
      <main className="container-tight flex flex-1 flex-col justify-center gap-6 py-16">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">This connection request has expired</h1>
          <p className="text-ink-muted">
            Connection requests are only valid for a few minutes, and only in the browser that
            started them. Nothing was connected. Go back to the application and start again.
          </p>
        </div>
        <Link href="/app" className="text-sm text-ink-muted underline">
          Go to your dashboard
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
