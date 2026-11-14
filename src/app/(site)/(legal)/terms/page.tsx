import type { Metadata } from 'next';
import Link from 'next/link';
import {
  GOVERNING_LAW,
  INSTANCE_NAME,
  SOURCE_DISPLAY,
  SOURCE_URL,
  SUPPORT_EMAIL,
  SUPPORT_MAILTO,
  operatorLabel,
} from '@/lib/site-config';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  path: '/terms',
  title: 'Terms of service',
  description: `The terms for using ${INSTANCE_NAME}: acceptable use, what organizers and participants are responsible for, availability, liability, and the AGPL-3.0 licence.`,
  siteName: INSTANCE_NAME,
});

export default function TermsPage() {
  const operator = operatorLabel();
  return (
    <>
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Terms of service</h1>
        <p className="text-sm text-ink-muted">Last updated: 31 October 2026</p>
      </header>

      <section className="space-y-3">
        <p>
          {INSTANCE_NAME} is a deployment of the OpenSignup project, released under the GNU AGPL-3.0
          license. The source code is available at{' '}
          <a href={SOURCE_URL} className="text-brand underline">
            {SOURCE_DISPLAY}
          </a>
          . By using this site you agree to the terms below. If you do not agree, do not use the
          service. In these terms, &ldquo;we&rdquo; and &ldquo;us&rdquo; mean {operator}, who runs
          this instance.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Who can use it</h2>
        <p>
          {INSTANCE_NAME} is not meant for children to use on their own. When a signup is for a
          child, a parent or guardian should sign up for them. To create an organizer account, you
          must be old enough to agree to these terms where you live.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">No warranty</h2>
        <p>
          The software is provided &ldquo;as is&rdquo;, without warranty of any kind, express or
          implied, including but not limited to merchantability, fitness for a particular purpose,
          and non-infringement. To the maximum extent permitted by applicable law, in no event shall{' '}
          {operator} or any contributor to OpenSignup be liable for any claim, damages, or other
          liability arising from your use of the service. This mirrors the disclaimer in the
          AGPL-3.0 license.
        </p>
        <p>
          Nothing in these terms excludes or limits our liability for death or personal injury
          caused by our negligence, for fraud, or for anything else the law does not let us exclude
          or limit.
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
          <li>
            Interfere with the service&apos;s normal operation, including by automated abuse,
            rate-limit evasion, or denial-of-service.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">If you run a signup</h2>
        <p>As an organizer, you are responsible for:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>What your signups say and ask for, including the fields and text you add.</li>
          <li>
            Having a good reason to collect the details people give when they sign up, using them
            only for what your signup is for, and telling people about any other use.
          </li>
          <li>
            Looking after the participant details you see, download or share, including with an app
            you connect.
          </li>
          <li>
            Following the laws that apply to you and your signup, including any about
            children&apos;s details.
          </li>
        </ul>
        <p>
          If someone makes a claim against us because of a signup you ran, what you put in it, or
          your breaking these terms, you agree to cover our reasonable costs of dealing with that
          claim, as far as the law allows. This does not apply to the extent the claim was caused by
          something we did.
        </p>
        <p>
          We hold participants&apos; details on your behalf to run your signup. We use them only as
          the{' '}
          <Link href="/privacy" className="text-brand underline">
            privacy policy
          </Link>{' '}
          describes, keep them confidential, tell you if we learn of a breach affecting them, delete
          them when you ask, and tell you on request which providers handle them.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">If you sign up for a slot</h2>
        <p>
          Give a name the organizer will recognise, and an email address that is yours or that you
          have permission to use. Your link to change or cancel works like a password: anyone who
          has it can change or cancel your place, so don&apos;t share it.
        </p>
        <p>
          What you arrange through a signup is between you and its organizer. We are not part of
          that arrangement, and we are not responsible for whether an event happens, or for what the
          organizer or other participants do.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Third-party sign-in</h2>
        <p>
          If this instance offers sign-in through a third-party provider (for example, Google) and
          you choose it, your use of that provider is also governed by that provider&apos;s own
          terms and privacy policy. {INSTANCE_NAME} is not responsible for third-party services.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Connecting apps to your account</h2>
        <p>
          You can connect a third-party app or AI assistant to your account. Anything you connect
          acts as you, in every workspace you belong to, with the permissions you approved, so what
          it does counts as your own action under these terms. You are responsible for choosing what
          to connect, for reading that app&apos;s own terms and privacy policy first, and for
          disconnecting it when you no longer need it.
        </p>
        <p>
          Letting an app see participant names and email addresses is a separate permission and a
          separate decision. Those participants gave their details to you as the organizer; sharing
          them with an assistant is your call, and the same care you would apply to sharing a
          participant list any other way applies here.
        </p>
        <p>
          We may refuse, block, or revoke a client that abuses the service, misrepresents who it is,
          or is used to break the acceptable use rules above. You can revoke any connection yourself
          at any time from Connected apps in your settings.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Availability and emails</h2>
        <p>
          We try to keep {INSTANCE_NAME} running, but we do not promise it will always be available
          or free of errors, and we may change it or stop running it. If we plan to stop, we will
          try to tell organizers first so they can download their signups.
        </p>
        <p>
          Emails, including confirmations, reminders and moved-slot emails, are sent on a
          best-effort basis. They can be late, land in spam, or not arrive at all. Don&apos;t rely
          on them alone for anything that matters: for important arrangements, organizers should
          confirm directly with the people involved. Keep your own copy of anything you can&apos;t
          afford to lose; organizers can download a signup&apos;s list with{' '}
          <strong>Download CSV</strong> on its Responses page.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Operator&apos;s rights</h2>
        <p>
          We may remove signups, close workspaces, or refuse access where content or behaviour
          violates the acceptable use rules above or applicable law. Where reasonably possible, we
          will notify the affected organizer first.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Changes to these terms</h2>
        <p>
          These terms may be updated as the service evolves. The &ldquo;last updated&rdquo; date at
          the top of this page will reflect any change. Continued use of the service after an update
          constitutes acceptance of the revised terms.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Governing law</h2>
        <p>
          These terms are governed by the laws of {GOVERNING_LAW}, without regard to conflict-of-law
          principles. Nothing in these terms limits any non-waivable rights you have under the law
          of the place where you live.
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
