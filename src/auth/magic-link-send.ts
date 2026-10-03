import type { EmailMessage, EmailTransport } from '@/email/transport';
import { log } from '@/lib/log';
import { withTimeout } from '@/lib/with-timeout';

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
 * real error if it fails, and that it went out if it succeeds.
 */
export async function sendMagicLinkEmail(
  transport: EmailTransport,
  message: EmailMessage,
): Promise<void> {
  const startedAt = Date.now();
  await withTimeout(
    transport.send(message),
    MAGIC_LINK_SEND_TIMEOUT_MS,
    `magic link send timed out after ${MAGIC_LINK_SEND_TIMEOUT_MS / 1000} s`,
    {
      onLateSettle: (result) => {
        const elapsedMs = Date.now() - startedAt;
        if (result.status === 'fulfilled') {
          // The same address the on-time "magic link dispatched" line logs.
          log.warn(
            { email: message.to, elapsedMs },
            'magic link dispatched after its send timed out',
          );
        } else {
          log.error(
            { sendError: describeSendError(result.reason), elapsedMs },
            'magic link send failed after it timed out',
          );
        }
      },
    },
  );
}

/**
 * The message and codes that say what went wrong, not the whole error:
 * nodemailer hangs the rejected recipients' addresses on some.
 */
function describeSendError(reason: unknown) {
  if (!(reason instanceof Error)) return { message: String(reason) };
  const { code, responseCode } = reason as Error & { code?: unknown; responseCode?: unknown };
  return { message: reason.message, code, responseCode };
}
