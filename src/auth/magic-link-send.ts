import { describeSendError, toSendFailure } from '@/email/send-error';
import type { EmailMessage, EmailTransport } from '@/email/transport';
import { log } from '@/lib/log';
import { withTimeout } from '@/lib/with-timeout';
import { extractEmailDomain } from './email-domain';

// Long enough for a relay that is merely slow. A host that is down fails
// sooner, in the transport (see src/email/smtp.ts).
export const MAGIC_LINK_SEND_TIMEOUT_MS = 30_000;

/**
 * Sends the sign-in email, giving up after MAGIC_LINK_SEND_TIMEOUT_MS. The
 * person is watching a spinner, so a slow mail server gets an overall limit
 * here rather than in the transport, which the reminder worker shares.
 *
 * Giving up doesn't stop the send, and the timeout error says nothing about
 * the mail server, so how a send that outlives the limit ends is logged: the
 * real error if it fails, and that it went out if it succeeds. Like the
 * on-time "magic link dispatched" line, they name the recipient's domain,
 * never the address (see "Logs and rate-limiting" on /privacy).
 *
 * A send that fails in time rejects with a fresh error carrying only what
 * describeSendError keeps, not the transport's own: that one goes on to
 * Auth.js and its logger, and a refused recipient's address is on it (in
 * nodemailer's `rejected` and `response`, or in Resend's response body).
 */
export async function sendMagicLinkEmail(
  transport: EmailTransport,
  message: EmailMessage,
): Promise<void> {
  const startedAt = Date.now();
  const emailDomain = extractEmailDomain(message.to);
  await withTimeout(
    transport.send(message).catch((reason: unknown) => {
      throw toSendFailure(reason);
    }),
    MAGIC_LINK_SEND_TIMEOUT_MS,
    `magic link send timed out after ${MAGIC_LINK_SEND_TIMEOUT_MS / 1000} s`,
    {
      onLateSettle: (result) => {
        const elapsedMs = Date.now() - startedAt;
        if (result.status === 'fulfilled') {
          log.warn({ emailDomain, elapsedMs }, 'magic link dispatched after its send timed out');
        } else {
          log.error(
            { emailDomain, sendError: describeSendError(result.reason), elapsedMs },
            'magic link send failed after it timed out',
          );
        }
      },
    },
  );
  log.info({ emailDomain }, 'magic link dispatched');
}
