import { redactSignInCodes, redactUrlQueryStrings } from '@/email/console';
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
 * real error if it fails, and that it went out if it succeeds. Both lines
 * name the recipient, as the on-time "magic link dispatched" line does.
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
          log.warn(
            { email: message.to, elapsedMs },
            'magic link dispatched after its send timed out',
          );
        } else {
          log.error(
            { email: message.to, sendError: describeSendError(result.reason), elapsedMs },
            'magic link send failed after it timed out',
          );
        }
      },
    },
  );
}

/**
 * The message and codes that say what went wrong, and the same for its
 * `cause`, one level down: fetch, which the Resend transport uses, reports a
 * refused connection as just "fetch failed" and keeps the reason there.
 *
 * Never the whole error object: nodemailer hangs the server's raw response,
 * the failed command and an error per rejected recipient on it, and none of
 * that belongs in this line. The text that is kept is the mail server's (or
 * Resend's response body), which could quote the email it refused, so the
 * link's query string and anything shaped like the sign-in code are blanked.
 */
function describeSendError(reason: unknown) {
  if (!(reason instanceof Error)) return { message: scrub(String(reason)) };
  const { code, responseCode, cause } = reason as Error & {
    code?: unknown;
    responseCode?: unknown;
  };
  return {
    message: scrub(reason.message),
    code,
    responseCode,
    ...(cause !== undefined && { cause: describeCause(cause) }),
  };
}

function describeCause(cause: unknown) {
  if (!(cause instanceof Error)) return { message: scrub(String(cause)) };
  const { code } = cause as Error & { code?: unknown };
  return { message: scrub(cause.message), code };
}

function scrub(text: string): string {
  return redactSignInCodes(redactUrlQueryStrings(text));
}
