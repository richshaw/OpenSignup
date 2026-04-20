import NextAuth, { type NextAuthConfig } from 'next-auth';
import Nodemailer from 'next-auth/providers/nodemailer';
import { createElement } from 'react';
import { getEnv } from '@/lib/env';
import { renderEmail } from '@/email/render';
import { getEmailTransport } from '@/email';
import { MagicLinkEmail } from '@/email/templates/magic-link';
import { log } from '@/lib/log';
import { SignupAdapter } from './adapter';

const config: NextAuthConfig = {
  adapter: SignupAdapter(),
  session: { strategy: 'database' },
  trustHost: true,
  providers: [
    Nodemailer({
      // This is a required-but-unused server config. We override `sendVerificationRequest`
      // to go through our own email transport, so this just needs to be a valid object.
      server: 'smtp://user:pass@localhost:2525',
      from: getEnv().EMAIL_FROM,
      async sendVerificationRequest({ identifier, url, expires }) {
        const expiresInMinutes = Math.max(
          1,
          Math.round((expires.getTime() - Date.now()) / 60_000),
        );
        const node = createElement(MagicLinkEmail, { url, email: identifier, expiresInMinutes });
        const { html, text } = await renderEmail(node);
        await getEmailTransport().send({
          to: identifier,
          subject: 'Sign in to Signup',
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

export const { handlers, auth, signIn, signOut } = NextAuth(config);
export { config as authConfig };
