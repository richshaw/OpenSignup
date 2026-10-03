import NextAuth, { type NextAuthConfig } from 'next-auth';
import Nodemailer from 'next-auth/providers/nodemailer';
import { createElement } from 'react';
import { getDb } from '@/db/client';
import { renderEmail } from '@/email/render';
import { getEmailTransport } from '@/email';
import { MagicLinkEmail } from '@/email/templates/magic-link';
import { recordActivity } from '@/lib/activity';
import { getEnv } from '@/lib/env';
import { log } from '@/lib/log';
import { withTimeout } from '@/lib/with-timeout';
import { SignupAdapter } from './adapter';
import { buildOAuthProviders } from './oauth-providers';
import { canonicalizeMagicLinkUrl, buildConfirmationUrl } from './magic-link-url';
import { extractEmailDomain } from './email-domain';
import { getMagicLinkMaxAgeSeconds } from './magic-link-expiry';
import { consumeMagicLinkRateLimits } from './magic-link-rate-limit';
import { getCurrentRequestIp } from './request-context';
import { issueLoginCode } from './login-code';

// Long enough for a relay that is merely slow. A host that is down fails
// sooner, in the transport (see src/email/smtp.ts).
const MAGIC_LINK_SEND_TIMEOUT_MS = 30_000;

// Built lazily on first request: SignupAdapter() touches getDb() → getEnv(),
// which would otherwise fire at module-load and break `next build`'s page-data
// collection (no env in the build container).
let cached: NextAuthConfig | null = null;
function buildConfig(): NextAuthConfig {
  if (cached) return cached;
  cached = {
    adapter: SignupAdapter(),
    session: { strategy: 'database' },
    trustHost: true,
    providers: [
      Nodemailer({
        // `server` and `from` are required by the Nodemailer provider but unused —
        // `sendVerificationRequest` below is overridden to use our own email transport,
        // which reads EMAIL_FROM lazily at request time.
        // Because of that override Auth.js never sends mail through nodemailer, so
        // its nodemailer peer range (^7 || ^8) is waived for 10 in package.json.
        server: 'smtp://user:pass@localhost:2525',
        from: 'noreply@opensignup.invalid',
        maxAge: getMagicLinkMaxAgeSeconds(),
        async sendVerificationRequest({ identifier, url, expires }) {
          const subject = identifier.trim().toLowerCase();
          // Throws MagicLinkRateLimited, which the login form tells apart
          // from a send that failed.
          await consumeMagicLinkRateLimits(getDb(), {
            email: subject,
            ip: await getCurrentRequestIp(),
          });
          const expiresInMinutes = Math.max(
            1,
            Math.round((expires.getTime() - Date.now()) / 60_000),
          );
          const safeUrl = canonicalizeMagicLinkUrl(url, getEnv().AUTH_URL);
          const confirmUrl = buildConfirmationUrl(safeUrl, getEnv().AUTH_URL);
          // The code redeems the same single-use callback as the link, from
          // whichever window the person started in (see ./login-code.ts).
          const code = await issueLoginCode(getDb(), {
            email: subject,
            callbackUrl: safeUrl,
            expiresAt: expires,
          });
          const node = createElement(MagicLinkEmail, {
            url: confirmUrl,
            email: identifier,
            expiresInMinutes,
            code,
          });
          const { html, text } = await renderEmail(node);
          // The person is watching a spinner, so a slow mail server gets an
          // overall limit here rather than in the transport, which the
          // reminder worker shares.
          await withTimeout(
            getEmailTransport().send({
              to: identifier,
              subject: 'Sign in to OpenSignup',
              html,
              text,
            }),
            MAGIC_LINK_SEND_TIMEOUT_MS,
            `magic link send timed out after ${MAGIC_LINK_SEND_TIMEOUT_MS / 1000} s`,
          );
          log.info({ email: identifier }, 'magic link dispatched');
          try {
            await recordActivity(getDb(), {
              signupId: null,
              workspaceId: null,
              actor: { actorId: null, actorType: 'system' },
              eventType: 'auth.magic_link_sent',
              payload: { emailDomain: extractEmailDomain(identifier), expiresInMinutes },
            });
          } catch (err) {
            log.warn({ err }, 'recordActivity auth.magic_link_sent failed');
          }
        },
      }),
      // Optional, env-gated OAuth providers (e.g. Google). Empty when none are
      // configured, so the magic-link flow is unaffected by default.
      ...buildOAuthProviders(),
    ],
    pages: {
      signIn: '/login',
      verifyRequest: '/login/check',
      error: '/login',
    },
    callbacks: {
      async session({ session, user }) {
        if (session.user && user) {
          session.user.id = user.id;
        }
        return session;
      },
    },
    events: {
      async signIn({ user, isNewUser }) {
        if (!user?.id) return;
        try {
          await recordActivity(getDb(), {
            signupId: null,
            workspaceId: null,
            actor: { actorId: user.id, actorType: 'organizer' },
            eventType: 'auth.signed_in',
            payload: { isNewUser: Boolean(isNewUser) },
          });
        } catch (err) {
          log.warn({ err }, 'recordActivity auth.signed_in failed');
        }
      },
    },
  };
  return cached;
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => buildConfig());
