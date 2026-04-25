import NextAuth, { type NextAuthConfig } from 'next-auth';
import Nodemailer from 'next-auth/providers/nodemailer';
import { createElement } from 'react';
import { renderEmail } from '@/email/render';
import { getEmailTransport } from '@/email';
import { MagicLinkEmail } from '@/email/templates/magic-link';
import { log } from '@/lib/log';
import { SignupAdapter } from './adapter';

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
        from: 'noreply@signups.invalid',
        async sendVerificationRequest({ identifier, url, expires }) {
          const expiresInMinutes = Math.max(
            1,
            Math.round((expires.getTime() - Date.now()) / 60_000),
          );
          const node = createElement(MagicLinkEmail, { url, email: identifier, expiresInMinutes });
          const { html, text } = await renderEmail(node);
          await getEmailTransport().send({
            to: identifier,
            subject: 'Sign in to Signups',
            html,
            text,
          });
          log.info({ email: identifier }, 'magic link dispatched');
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
  };
  return cached;
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => buildConfig());
