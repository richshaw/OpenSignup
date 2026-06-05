import type { Metadata } from 'next';
import Link from 'next/link';
import {
  INSTANCE_NAME,
  SOURCE_DISPLAY,
  SOURCE_URL,
  SUPPORT_EMAIL,
  SUPPORT_MAILTO,
  operatorLabel,
} from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: `How ${INSTANCE_NAME} collects and uses your data.`,
};

export default function PrivacyPage() {
  const operator = operatorLabel();
  return (
    <>
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy policy</h1>
        <p className="text-ink-muted text-sm">Last updated: 2 June 2026</p>
      </header>

      <section className="space-y-3">
        <p>
          This page describes what data {INSTANCE_NAME} collects and how it is used. It
          is written in plain English and reflects what the code actually does — the
          source is open and you can verify any claim here against the schema at{' '}
          <a href={SOURCE_URL} className="text-brand underline">
            {SOURCE_DISPLAY}
          </a>
          .
        </p>
        <p>
          The OpenSignup <em>project</em> is an open-source coordination tool released
          under AGPL-3.0. This page applies to <em>this instance</em> — the deployment
          you are currently using. The data controller for this instance is {operator}.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">What we collect from organizers</h2>
        <p>
          Organizers (people who create signups) sign in without a password — either
          via a magic link sent to their email or, where the operator has enabled it,
          an optional third-party sign-in such as Google. We store:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Email address (used to send magic-link sign-in emails).</li>
          <li>Optional display name and organization name.</li>
          <li>The signups, slots, and settings you create.</li>
          <li>
            An append-only activity log of organizer actions (sign-ins, creating
            and editing signups, sending magic links), participant commitments on
            your signups, and reminder dispatches. This exists so an organizer
            can audit what happened in their own workspace and so the operator
            can investigate abuse. The same log records anonymous view telemetry
            on the marketing home page and on your public signup pages (see
            &ldquo;Logs and rate-limiting&rdquo; below).
          </li>
        </ul>
        <p>No password is ever stored — sign-in is passwordless.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">What we collect from participants</h2>
        <p>
          Participants (people signing up for a slot) never create an account. When you
          commit to a slot we store only what is needed to honour your commitment:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Display name.</li>
          <li>
            Email address. This is required so we can send you a confirmation,
            optional reminders, and a link to edit or cancel your commitment.
          </li>
          <li>Your slot selection, quantity, and any optional notes.</li>
        </ul>
        <p>
          A short-lived browser cookie lets you return and edit or cancel your own
          commitment without re-entering your email. See the{' '}
          <Link href="/cookies" className="text-brand underline">
            cookies page
          </Link>{' '}
          for details.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Logs and rate-limiting</h2>
        <p>
          To prevent abuse, the server records request IP addresses in short-lived
          rate-limit records (e.g. to throttle magic-link sends). These rows are
          scoped to individual buckets and are not joined to your account or
          commitment for analytics. Server-side application logs are standard
          request/error logs and do not include cookies, tokens, or magic-link URLs.
        </p>
        <p>
          For each view of a public signup page, the server writes a single
          activity entry containing a user-agent class (browser, bot, or
          unknown), the host of the referring page (not the full referer URL),
          the signup&apos;s status, and whether the viewer is a returning
          participant on that signup. We do not record your IP address on this
          entry. Bot traffic and requests carrying a Do Not Track or Global
          Privacy Control signal are skipped. The same applies when you follow
          an &ldquo;edit your commitment&rdquo; link, when you load the
          marketing home page, and when you click the &ldquo;Start a
          signup&rdquo; button on it (where we record only the user-agent class
          and the referring host).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Email delivery</h2>
        <p>
          {INSTANCE_NAME} sends two kinds of email: organizer magic-link sign-in
          emails, and slot reminders to participants who provided an email address.
          Delivery uses whichever transport the operator has configured (SMTP, a
          transactional provider, or local console output in development). No marketing
          email is ever sent.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Third parties</h2>
        <p>
          OpenSignup is designed to have no required external dependencies beyond a
          Postgres database. Optional integrations (email provider, error reporting,
          product analytics, AI draft generation, and third-party sign-in) are off by
          default and only enabled if the operator has configured them via environment
          variables. Where this instance has enabled any such integration, the operator
          will list it on request.
        </p>
        <p>
          If third-party sign-in (for example, Google) is enabled and you choose it, you
          authenticate on the provider&apos;s own site and they return your email, name,
          avatar, and a unique account identifier. We store the link between that provider
          account and your organizer record — along with the standard sign-in tokens the
          provider issues — so we can recognise you on future sign-ins. We do not use those
          tokens to access anything on the provider beyond the basic profile needed to sign
          you in.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Your rights</h2>
        <p>
          You can request a copy of the data we hold about you, or ask us to delete it,
          by emailing{' '}
          <a href={SUPPORT_MAILTO} className="text-brand underline">
            {SUPPORT_EMAIL}
          </a>
          . Today this is a manual process — self-service export and deletion endpoints
          are on the roadmap. Organizers can already delete individual signups from
          their workspace settings, which removes the associated commitments.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Self-hosting note</h2>
        <p>
          If you are reading this on a self-hosted copy of OpenSignup, the operator of
          that instance — not the OpenSignup project — is responsible for how your data
          is handled. The OpenSignup project publishes source code only; it does not
          operate or have access to data on other people&apos;s deployments.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Contact</h2>
        <p>
          Questions about this policy or about data we hold:{' '}
          <a href={SUPPORT_MAILTO} className="text-brand underline">
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </section>
    </>
  );
}
