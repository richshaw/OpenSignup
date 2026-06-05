import type { Metadata } from 'next';
import {
  GOVERNING_LAW,
  INSTANCE_NAME,
  SOURCE_DISPLAY,
  SOURCE_URL,
  SUPPORT_EMAIL,
  SUPPORT_MAILTO,
  operatorLabel,
} from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Terms of service',
  description: `Terms for using ${INSTANCE_NAME}.`,
};

export default function TermsPage() {
  const operator = operatorLabel();
  return (
    <>
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Terms of service</h1>
        <p className="text-ink-muted text-sm">Last updated: 2 June 2026</p>
      </header>

      <section className="space-y-3">
        <p>
          {INSTANCE_NAME} is a deployment of the OpenSignup project, released under the
          GNU AGPL-3.0 license. The source code is available at{' '}
          <a href={SOURCE_URL} className="text-brand underline">
            {SOURCE_DISPLAY}
          </a>
          . By using this site you agree to the terms below. If you do not agree, do
          not use the service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">No warranty</h2>
        <p>
          The software is provided &ldquo;as is&rdquo;, without warranty of any kind,
          express or implied, including but not limited to merchantability, fitness for
          a particular purpose, and non-infringement. To the maximum extent permitted
          by applicable law, in no event shall {operator} or any contributor to
          OpenSignup be liable for any claim, damages, or other liability arising from
          your use of the service. This mirrors the disclaimer in the AGPL-3.0 license.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Acceptable use</h2>
        <p>You agree not to use {INSTANCE_NAME} to:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Harass, threaten, or harm anyone.</li>
          <li>Collect signups for illegal activity.</li>
          <li>Send unsolicited bulk messages or spam.</li>
          <li>Attempt to access data belonging to other organizers or workspaces.</li>
          <li>Interfere with the service&apos;s normal operation, including by automated abuse, rate-limit evasion, or denial-of-service.</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Third-party sign-in</h2>
        <p>
          If this instance offers sign-in through a third-party provider (for example,
          Google) and you choose it, your use of that provider is also governed by that
          provider&apos;s own terms and privacy policy.{' '}
          {INSTANCE_NAME} is not responsible for third-party services.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Operator&apos;s rights</h2>
        <p>
          {operator} may remove signups, close workspaces, or refuse access where
          content or behaviour violates the acceptable use rules above or applicable
          law. Where reasonably possible, the operator will notify the affected
          organizer first.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Changes to these terms</h2>
        <p>
          These terms may be updated as the service evolves. The &ldquo;last updated&rdquo;
          date at the top of this page will reflect any change. Continued use of the
          service after an update constitutes acceptance of the revised terms.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Governing law</h2>
        <p>
          These terms are governed by the laws of {GOVERNING_LAW}, without regard to
          conflict-of-law principles. Nothing in these terms limits any non-waivable
          rights you have under the law of the place where you live.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Contact</h2>
        <p>
          Questions about these terms:{' '}
          <a href={SUPPORT_MAILTO} className="text-brand underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>
    </>
  );
}
