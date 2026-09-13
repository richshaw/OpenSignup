import { randomUUID } from 'node:crypto';
import { getEnv } from '@/lib/env';
import { log } from '@/lib/log';
import type { EmailMessage, EmailResult, EmailTransport } from './transport';

/**
 * Blanks the query string of every URL in a block of text.
 *
 * Both magic-link tokens and participant edit tokens travel in query strings,
 * and edit tokens are HMAC(secret, commitment_id) — stable for the life of the
 * commitment and never rotated — so one leaked log line grants edit and cancel
 * on that commitment forever.
 */
export function redactUrlQueryStrings(text: string): string {
  return text.replace(/(https?:\/\/[^\s?]+)\?\S*/g, '$1?[redacted]');
}

/**
 * The sign-in email prints a six-digit code that redeems the same single-use
 * callback as the link. Like the link's token it must never reach a log, so
 * outside development any standalone six-digit number in the preview is
 * blanked (a slot count or a date never appears as exactly six bare digits).
 */
export function redactSignInCodes(text: string): string {
  return text.replace(/(?<!\d)\d{6}(?!\d)/g, '[redacted]');
}

export class ConsoleTransport implements EmailTransport {
  constructor(private readonly from: string) {}

  async send(msg: EmailMessage): Promise<EmailResult> {
    const id = randomUUID();
    const from = msg.from ?? this.from;
    const matched = msg.text.match(/https?:\/\/\S+/g) ?? [];
    // Tokens live in the query string; only emit them in dev so they don't land
    // in prod log aggregation if EMAIL_TRANSPORT defaults to console. The body
    // preview needs the same treatment as `urls` — participant emails put the
    // token-bearing link in the body, well inside the 600-char slice.
    const isDev = getEnv().NODE_ENV === 'development';
    const urls = isDev ? matched : matched.map((u) => u.split('?')[0]);
    const text = isDev ? msg.text : redactSignInCodes(redactUrlQueryStrings(msg.text));
    log.info(
      {
        emailId: id,
        to: msg.to,
        from,
        subject: msg.subject,
        urls,
        textPreview: text.slice(0, 600),
      },
      '[email:console] 📬 would send',
    );
    return { id, transport: 'console' };
  }
}
