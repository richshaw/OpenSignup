import type { Metadata } from 'next';
import Link from 'next/link';
import { INSTANCE_NAME } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Cookies',
  description: `Cookies set by ${INSTANCE_NAME}.`,
};

export default function CookiesPage() {
  return (
    <>
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Cookies</h1>
        <p className="text-ink-muted text-sm">Last updated: 24 May 2026</p>
      </header>

      <section className="space-y-3">
        <p>
          {INSTANCE_NAME} sets only the cookies it needs to operate. There are no
          analytics, advertising, or cross-site tracking cookies, and no third-party
          cookies of any kind.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Cookies we set</h2>
        <div className="border-surface-sunk overflow-hidden rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-raised text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Purpose</th>
                <th className="px-4 py-3 font-medium">Lifetime</th>
              </tr>
            </thead>
            <tbody className="divide-surface-sunk divide-y">
              <tr>
                <td className="px-4 py-3 font-mono text-xs">
                  authjs.session-token (or __Secure-authjs.session-token over HTTPS)
                </td>
                <td className="px-4 py-3">
                  Keeps organizers signed in after they click their magic link.
                </td>
                <td className="px-4 py-3">Session</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs">
                  authjs.csrf-token, authjs.callback-url (prefixed with __Secure- or __Host- over
                  HTTPS)
                </td>
                <td className="px-4 py-3">
                  Required by the magic-link sign-in flow to prevent CSRF.
                </td>
                <td className="px-4 py-3">Short-lived</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs">os_commit</td>
                <td className="px-4 py-3">
                  Lets participants who already committed to a slot return and edit or
                  cancel without re-entering their email. <code>httpOnly</code>; not
                  readable from JavaScript.
                </td>
                <td className="px-4 py-3">60 days</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Why there is no cookie banner</h2>
        <p>
          Every cookie above is strictly necessary to make the service work — either
          for sign-in or to let a participant edit their own commitment. Under
          GDPR/ePrivacy, strictly-necessary cookies do not require a consent banner.
          That is why you don&apos;t see a popup.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Related</h2>
        <p>
          See the{' '}
          <Link href="/privacy" className="text-brand underline">
            privacy policy
          </Link>{' '}
          for what data we store and how to request a copy or deletion.
        </p>
      </section>
    </>
  );
}
