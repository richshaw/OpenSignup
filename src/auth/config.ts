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
import { RateLimits, consumeRateLimit } from '@/lib/rate-limit';
import { ServiceException } from '@/lib/errors';
import { SignupAdapter } from './adapter';
import { canonicalizeMagicLinkUrl } from './magic-link-url';
import { extractEmailDomain } from './email-domain';
import { getMagicLinkMaxAgeSeconds } from './magic-link-expiry';
import { getCurrentRequestIp } from './request-context';

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
        server: 'smtp://user:pass@localhost:2525',
        from: 'noreply@opensignup.invalid',
        maxAge: getMagicLinkMaxAgeSeconds(),
        async sendVerificationRequest({ identifier, url, expires }) {
          const subject = identifier.trim().toLowerCase();
          const ip = await getCurrentRequestIp();
          try {
            // IP bucket first: a misbehaving IP exhausts its own quota
            // before it can degrade any victim's per-email quota. Null IPs
            // share an "unknown" bucket so deployments missing
            // x-forwarded-for / x-real-ip don't silently no-op.
            await consumeRateLimit(getDb(), RateLimits.magicLinkPerIp, ip ?? 'unknown');
            await consumeRateLimit(getDb(), RateLimits.magicLinkPerEmail, subject);
          } catch (err) {
            if (err instanceof ServiceException && err.serviceError.code === 'rate_limited') {
              log.warn(
                { email: subject, ip, bucket: err.serviceError.details?.bucket },
                'magic link rate-limited',
              );
            }
            throw err;
          }
          const expiresInMinutes = Math.max(
            1,
            Math.round((expires.getTime() - Date.now()) / 60_000),
          );
          const safeUrl = canonicalizeMagicLinkUrl(url, getEnv().AUTH_URL);
          const node = createElement(MagicLinkEmail, {
            url: safeUrl,
            email: identifier,
            expiresInMinutes,
          });
          const { html, text } = await renderEmail(node);
          await getEmailTransport().send({
            to: identifier,
            subject: 'Sign in to OpenSignup',
            html,
            text,
          });
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
    ],
    pages: {
      signIn: '/login',
      verifyRequest: '/login/check',
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
