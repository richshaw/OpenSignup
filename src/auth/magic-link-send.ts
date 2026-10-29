import { redactSignInCodes, redactUrlQueryStrings } from '@/email/console';
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

type SendError = {
  message: string;
  code?: unknown;
  responseCode?: unknown;
  cause?: { message: string; code?: unknown };
};

/**
 * The message and codes that say what went wrong, and the same for its
 * `cause`, one level down: fetch, which the Resend transport uses, reports a
 * refused connection as just "fetch failed" and keeps the reason there.
 *
 * Never the whole error object: nodemailer hangs the server's raw response,
 * the failed command and an error per rejected recipient on it, and none of
 * that belongs in this line. The text that is kept is the mail server's (or
 * Resend's response body), which could quote the email it refused or the
 * address it refused it for, so the link's query string, anything shaped like
 * the sign-in code, and email addresses are blanked.
 */
function describeSendError(reason: unknown): SendError {
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

/**
 * An Error holding no more than describeSendError(reason) does, which reads
 * back the same from it, so the late-settle line is unchanged by the swap.
 */
function toSendFailure(reason: unknown): Error {
  const { message, code, responseCode, cause } = describeSendError(reason);
  const failure = new Error(
    message,
    cause && { cause: withCode(new Error(cause.message), cause.code) },
  );
  withCode(failure, code);
  if (responseCode !== undefined) Object.assign(failure, { responseCode });
  return failure;
}

function withCode(error: Error, code: unknown): Error {
  return code === undefined ? error : Object.assign(error, { code });
}

function describeCause(cause: unknown): NonNullable<SendError['cause']> {
  if (!(cause instanceof Error)) return { message: scrub(String(cause)) };
  const { code } = cause as Error & { code?: unknown };
  return { message: scrub(cause.message), code };
}

function scrub(text: string): string {
  return redactEmailAddresses(redactSignInCodes(redactUrlQueryStrings(text)));
}

// A mail server's refusal often quotes the recipient ("550 5.1.1
// <pat@example.com> … unknown user"), and Resend's 422 body names its `to`.
function redactEmailAddresses(text: string): string {
  return text.replace(/[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]');
}
