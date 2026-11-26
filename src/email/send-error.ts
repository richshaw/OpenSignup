import { redactSignInCodes, redactUrlQueryStrings } from './console';

// What a failed send rejects with, cleaned of the recipient's address: a mail
// server or Resend refusing an address names it, and that error goes on to a
// log. Shared by the sign-in email (src/auth/magic-link-send.ts) and the
// participant emails (./send.ts).

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
export function describeSendError(reason: unknown): SendError {
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
 * back the same from it. A send rejects with this in place of the
 * transport's own error, so whatever logs the rejection (Auth.js's logger,
 * the confirmation's catch, the worker's queues) sees no address.
 */
export function toSendFailure(reason: unknown): Error {
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
