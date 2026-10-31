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
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  path: '/privacy',
  title: 'Privacy policy',
  description: `How ${INSTANCE_NAME} collects, uses, and stores your data — what we keep for organizers and participants, the cookies we set, and how long we retain it.`,
  siteName: INSTANCE_NAME,
});

export default function PrivacyPage() {
  const operator = operatorLabel();
  return (
    <>
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Privacy policy</h1>
        <p className="text-sm text-ink-muted">Last updated: 31 October 2026</p>
      </header>

      <section className="space-y-3">
        <p>
          This page describes, in plain English, what data {INSTANCE_NAME} collects and how it is
          used. We keep it in line with what the code does, and the code is open: you can read it,
          database schema included, at{' '}
          <a href={SOURCE_URL} className="text-brand underline">
            {SOURCE_DISPLAY}
          </a>
          . If you find something this page gets wrong, tell us at{' '}
          <a href={SUPPORT_MAILTO} className="text-brand underline">
            {SUPPORT_EMAIL}
          </a>{' '}
          so we can correct it.
        </p>
        <p>
          The OpenSignup <em>project</em> is an open-source coordination tool released under
          AGPL-3.0. This page applies to <em>this instance</em>, the deployment you are using now,
          which {operator} runs. &ldquo;We&rdquo; and &ldquo;us&rdquo; on this page mean {operator}.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Who is responsible for your data</h2>
        <p>
          We are the data controller for organizers&apos; accounts, and for what this instance does
          with anyone&apos;s details to run the service and keep it safe: sending the emails
          described below, preventing abuse, and keeping the records this page lists.
        </p>
        <p>
          When you sign up for a slot, you are giving your details to the organizer who runs that
          signup. The organizer decides what their signup is for and what they do with the list of
          people on it, such as contacting you about it, sharing it with others, or downloading it.
          They are responsible for those choices, and for telling you about any use beyond running
          the signup. We store your details and run the signup for them.
        </p>
        <p>
          The organizer can see the name, email address and note you gave, and can download them,
          and so can an app they connect and allow to see participant details (see &ldquo;Connected
          apps and AI assistants&rdquo; below). People who open the signup&apos;s page see how many
          spots are taken, not who took them.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">What we collect from organizers</h2>
        <p>
          Organizers (people who create signups) sign in without a password — either via a magic
          link sent to their email or, where the operator has enabled it, an optional third-party
          sign-in such as Google. We store:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Email address (used to send magic-link sign-in emails).</li>
          <li>Optional display name and organization name.</li>
          <li>
            If your account was created by signing in with a third-party provider such as Google,
            the web address of the profile picture that provider returned.
          </li>
          <li>The signups, slots, and settings you create.</li>
          <li>
            An append-only activity log of organizer actions (sign-ins, creating and editing
            signups, sending magic links, copying a signup&rsquo;s link, or from the share panel
            sending it by your phone&rsquo;s share menu, choosing Email it, or showing or saving
            the QR code, a publish or an AI draft that didn&rsquo;t go through, and whether AI
            drafting asked you questions and how you answered them, in counts only, never what you
            or the AI wrote), which of your own pages you open and whether on a phone or a computer
            (never the browser&rsquo;s full identifying string), participant commitments on your
            signups, and reminder dispatches. For a copy or a share it records only which button
            it was and the signup&rsquo;s status: never the message, and nothing about who the
            link went to. This exists so an organizer can audit what happened in their own
            workspace, so the operator can investigate abuse, and so the operator can count, in
            aggregate, where organizers get stuck between starting a signup and sharing it. The
            same log records anonymous view telemetry on the marketing home page and on your
            public signup pages (see &ldquo;Logs and rate-limiting&rdquo; below).
          </li>
          <li>
            After a sign-in email is sent, the sign-in link&apos;s token (stored as a hash, next to
            your email address), kept until the link expires (an hour by default, or as long as the
            operator sets it). For up to 15 minutes, the six-digit code printed in the email (stored
            as a keyed hash) with the encrypted sign-in link it stands for, so you can finish
            signing in from the window you started in. Both are single use. A used or expired one
            cannot be redeemed, and an hourly cleanup deletes any that are left.
          </li>
          <li>
            If you connect an app or AI assistant to your account, a record of that approval and the
            tokens that keep it working. See &ldquo;Connected apps and AI assistants&rdquo; below.
          </li>
        </ul>
        <p>No password is ever stored — sign-in is passwordless.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">What we collect from participants</h2>
        <p>
          Participants (people signing up for a slot) never create an account. When you commit to a
          slot we store only what is needed to honour your commitment:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Display name.</li>
          <li>
            Email address, if you give one. The organizer decides whether a signup requires it. We
            use it to send you a confirmation with your link to change or cancel, and, if the
            organizer has reminders on, reminders and an email when your slot moves to a new date
            or time. If you leave it blank where that is allowed, we send you no
            emails. Your link is then shown on screen after you sign up, and only that browser
            remembers it: for 60 days, or until a week after your slot if that is later.
          </li>
          <li>Your slot selection, quantity, and any optional notes.</li>
          <li>
            Whether you have opted out of reminder emails for that signup, and when.
          </li>
        </ul>
        <p>
          A browser cookie keeps your link to change or cancel, so you can come back to your own
          commitment from the same browser. See the{' '}
          <Link href="/cookies" className="text-brand underline">
            cookies page
          </Link>{' '}
          for details.
        </p>
        <p>
          After you sign up, your browser also keeps the name and email address you entered, so the
          form is filled in for you the next time you sign up for anything on {INSTANCE_NAME}. That
          copy stays in your browser and is never sent to us on its own. On a shared or public
          computer, the next person to sign up in that browser will see your details filled in, so
          clear this site&apos;s data in the browser when you have finished; that removes it.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Logs and rate-limiting</h2>
        <p>
          To prevent abuse, the server keeps short-lived rate-limit records. They hold request IP
          addresses, the email address a sign-in link, sign-in code or sign-up is for (so a
          participant&apos;s address too), and, for some organizer actions such as creating a
          signup, the organizer&apos;s account identifier. An hourly cleanup deletes each record,
          normally within a few hours of it being written. These rows are scoped to individual
          buckets and are not joined to your account or commitment for analytics. Server-side
          application logs are standard request/error logs and do not include cookies, tokens,
          magic-link URLs, or email addresses; sign-in log lines name only the part of the address
          after the @.
        </p>
        <p>
          For each view of a public signup page, the server writes a single activity entry
          containing a user-agent class (browser, bot, or unknown), the host of the referring page
          (not the full referer URL), the signup&apos;s status, and whether the viewer is a
          returning participant on that signup. We do not record your IP address on this entry. Bot
          traffic and requests carrying a Do Not Track or Global Privacy Control signal are skipped.
          The same applies when you follow an &ldquo;edit your commitment&rdquo; link, when you load
          the marketing home page, and when you click the &ldquo;Start a signup&rdquo; button on it
          (where we record only the user-agent class and the referring host).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Email delivery</h2>
        <p>
          {INSTANCE_NAME} sends four kinds of email: organizer magic-link sign-in emails, a
          confirmation to a participant when they commit to a slot, a reminder before a dated
          slot, and an email when the organizer moves a participant&apos;s slot to a new date or
          time. A participant gets these only if they gave an email address. Moving to a different
          slot gives your spot a new private link, and sends a fresh confirmation with it. The
          old link then leads to the new one. Each of these participant emails contains a private
          link that lets you change or cancel that commitment without signing in, so treat them as
          you would a password and don&apos;t forward them. Reminders go out the day before the slot,
          and a moved-slot email about 10 minutes after the organizer&apos;s last change to its date
          or time; organizers can turn both off for a signup entirely, with the reminders setting.
          Every reminder and moved-slot email carries a link that stops both for that signup; we record only the time you opted out, and it does not affect
          any other signup or your slot itself. Delivery uses whichever transport the operator has
          configured (SMTP, a transactional provider, or local console output in
          development). No marketing email is ever sent.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Connected apps and AI assistants</h2>
        <p>
          An organizer can connect a third-party app, typically an AI assistant such as the Claude
          app, Claude Code, or ChatGPT, to their {INSTANCE_NAME} account. Nothing is connected
          unless the organizer approves it on a consent screen that names the domain the app
          identified itself from (or, for an app the operator of this instance registered in
          advance, the name the operator gave it) and lists exactly what it will be able to do. Participants are
          never asked to sign in and cannot connect anything.
        </p>
        <p>
          A connected app acts as the organizer who approved it, across every workspace that
          organizer belongs to, with the same role and never more access than the organizer has
          themselves. Permissions are approved individually: seeing your signups and their slots,
          and creating, editing, publishing and deleting signups. Participant names and email addresses sit behind a
          separate permission an app has to ask for explicitly; the consent screen flags it in amber
          and says plainly that participants gave those details to you, not to the app. An app that
          was not granted that permission cannot read participant details at all.
        </p>
        <p>
          For each connected app we store the approval (which organizer, which app, which
          permissions, when it was approved, when it was last used, and when it expires), the
          app&apos;s identifier and the name it reports about itself, the refresh tokens that keep
          the connection alive, and, for the minute it takes to set a connection up, the
          single-use code that establishes it. Access tokens themselves are not stored. The
          activity log records that a connection was approved, declined, or disconnected,
          together with the app&apos;s domain (or its configured identifier, for a
          pre-registered app), and, for every change a connected app makes on your behalf,
          which app made it. It never records a token or an email address.
        </p>
        <p>
          You can see and end every connection from <strong>Connected apps</strong> in your account
          settings. Disconnecting deletes the approval and every refresh token under it at once, so
          the app can get no new access; an access token it already holds keeps working until it
          expires, which is at most 15 minutes. No approval survives longer than 90 days without you
          approving the app again.
        </p>
        <p>
          Whatever a connected assistant reads under the permissions you approved is then processed
          by that assistant&apos;s vendor under their own terms and privacy policy, not ours. Apart
          from AI drafting, described under &ldquo;Third parties&rdquo; below,{' '}
          {INSTANCE_NAME} sends nothing to an AI vendor itself: only an app you connected, acting
          on your instructions, can pull data out.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Third parties</h2>
        <p>
          OpenSignup is designed to have no required external dependencies beyond a Postgres
          database. Optional integrations (email provider, error reporting, product analytics, AI
          draft generation, and third-party sign-in) are off by default and only enabled if the
          operator has configured them via environment variables. Where this instance has enabled
          any such integration, the operator will list it on request. Separately from anything the
          operator configures, an organizer can connect an app or AI assistant to their own account.
          See &ldquo;Connected apps and AI assistants&rdquo; above.
        </p>
        <p>
          If the operator has turned on AI drafting, what an organizer types into it to describe
          their signup, along with any answers they give to the questions it asks, is sent to the AI
          provider the operator configured, which turns it into a draft. It goes as typed, so leave
          out anything you wouldn&apos;t want the provider to see; nothing else about you, your
          signups or the people on them goes with it. The provider handles it under its own terms.
          To keep a description away from the provider, skip AI drafting and fill the signup in by
          hand.
        </p>
        <p>
          If third-party sign-in (for example, Google) is enabled and you choose it, you
          authenticate on the provider&apos;s own site and they return your email, name, avatar, and
          a unique account identifier. We store the link between that provider account and your
          organizer record — along with the standard sign-in tokens the provider issues — so we can
          recognise you on future sign-ins. If that sign-in created your account, we also keep the
          web address of the avatar the provider returned. We do not use those tokens to access anything on the
          provider beyond the basic profile needed to sign you in.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Why we use your data</h2>
        <p>Data protection law asks us to say what allows us to use your data. For each use:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            To provide what you asked for: an organizer&apos;s account, sign-in, signups, and the AI
            drafting and connected apps an organizer chooses to use; a participant&apos;s place on a
            slot, the confirmation email, and the link to change or cancel it. (In GDPR terms, this
            is necessary to provide the service you asked for.)
          </li>
          <li>
            To send reminders and moved-slot emails, when the organizer has them on, so people turn
            up at the right time. (Our and the organizer&apos;s legitimate interests. Every one of
            these emails has a link that stops them.)
          </li>
          <li>
            To keep the service safe and working: the rate-limit records, the activity log, and
            server logs. (Our legitimate interest in preventing abuse and fixing problems.)
          </li>
          <li>
            To count, in total, how the service is used: the page-view entries and where organizers
            get stuck, described above. (Our legitimate interest in improving the service.)
          </li>
          <li>Where the law requires it, for example to answer a valid legal request.</li>
        </ul>
        <p>Where we rely on legitimate interests, you can object by emailing us.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">How long we keep it</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            Organizer accounts, signups, slots, participants&apos; sign-ups and the activity log:
            nothing deletes these automatically yet. They stay until someone asks us to erase them
            (see &ldquo;Your rights&rdquo;), including after an organizer deletes a signup.
          </li>
          <li>
            Sign-in links and codes: until they are used or expire, then an hourly cleanup deletes
            them.
          </li>
          <li>Rate-limit records: normally a few hours.</li>
          <li>
            Connected-app approvals and tokens: until they expire or the organizer disconnects the
            app, as described under &ldquo;Connected apps and AI assistants&rdquo;.
          </li>
          <li>Server logs: as long as the hosting this instance runs on keeps them.</li>
          <li>
            What your browser keeps: see the{' '}
            <Link href="/cookies" className="text-brand underline">
              cookies page
            </Link>
            .
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Where your data is stored</h2>
        <p>
          Your data is kept in this instance&apos;s database, on servers we run or rent. If those
          servers, or a provider under &ldquo;Third parties&rdquo; that this instance has turned on,
          are in another country, your data goes to that country. Email{' '}
          <a href={SUPPORT_MAILTO} className="text-brand underline">
            {SUPPORT_EMAIL}
          </a>{' '}
          to find out where this instance and its providers are.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Children</h2>
        <p>
          {INSTANCE_NAME} is not meant for children to use on their own. When a signup is for a
          child, such as a class rota or a team&apos;s snack list, a parent or guardian should sign
          up for them, with their own email address. If you think a child has given us their
          details, email{' '}
          <a href={SUPPORT_MAILTO} className="text-brand underline">
            {SUPPORT_EMAIL}
          </a>{' '}
          and we will delete them.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Your rights</h2>
        <p>
          You can ask us for a copy of the data we hold about you, or ask us to correct it, delete
          it, or stop a use you object to, by emailing{' '}
          <a href={SUPPORT_MAILTO} className="text-brand underline">
            {SUPPORT_EMAIL}
          </a>
          . Today this is a manual process — self-service export and deletion endpoints are on the
          roadmap. If you signed up for a slot, you can also ask the organizer about their own use
          of your details. Organizers can already delete a signup from its settings. That takes the signup
          and everyone&apos;s commitments to it off the site at once: its page and everyone&apos;s
          edit links stop working, lists and exports stop showing them, and nobody can sign up to
          it. The records themselves stay in our database until someone asks us to erase them, as
          above.
        </p>
        <p>
          If you are not happy with how we handle a request, you can complain to the data
          protection authority where you live or work.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">Self-hosting note</h2>
        <p>
          If you are reading this on a self-hosted copy of OpenSignup, the operator of that instance
          — not the OpenSignup project — is responsible for how your data is handled. The OpenSignup
          project publishes source code only; it does not operate or have access to data on other
          people&apos;s deployments.
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
