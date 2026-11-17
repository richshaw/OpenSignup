import type { Translator } from '@/i18n/translator';
import type { CodeErrorReason, LoginErrorReason } from './login-form';

/**
 * The sign-in form's words, worked out on the server in the sign-in pages'
 * language (`signInLocale`) and passed in as props, as the organizer app's
 * client components get theirs, so /login sends the browser no messages and
 * no translator.
 */
export interface LoginFormText {
  /** The address box's label, and the example address in it. */
  email: string;
  emailPlaceholder: string;
  /** The button: at rest, while it sends, and once the link is sent. */
  send: string;
  sending: string;
  sent: string;
  /**
   * The line under it once the link is sent, "Link sent to {email}. Check
   * your inbox.", as the text before the address and after it: the address
   * is the one the browser sent, so it's put in there, in bold.
   */
  sentTo: { before: string; after: string };
  sendAgain: string;
  tryAgain: string;
  /** Why the link didn't go, by the reason the server gave. */
  errors: Record<LoginErrorReason, string>;
  code: CodeFormText;
}

/** The box for the six-digit code, which shows once the link is sent. */
export interface CodeFormText {
  label: string;
  hint: string;
  /** Its button, and its busy label. */
  submit: string;
  checking: string;
  /** Why the code didn't sign in, by the reason the server gave (`codeRefusal`). */
  errors: Record<CodeErrorReason, string>;
}

/**
 * Stands in for the address while the line it goes in is formatted, so the
 * line can be cut there: a character from Unicode's private use area, which
 * no translation holds.
 */
const ADDRESS = '';

/** `message` cut where `ADDRESS` is, or the whole of it before the address if it isn't there. */
function aroundAddress(message: string): { before: string; after: string } {
  const at = message.indexOf(ADDRESS);
  return at < 0
    ? { before: message, after: '' }
    : { before: message.slice(0, at), after: message.slice(at + ADDRESS.length) };
}

export function loginFormText(t: Translator<'auth'>): LoginFormText {
  return {
    email: t('form.email'),
    emailPlaceholder: t('form.emailPlaceholder'),
    send: t('form.send'),
    sending: t('form.sending'),
    sent: t('form.sent'),
    sentTo: aroundAddress(t('form.sentTo', { email: ADDRESS })),
    sendAgain: t('form.sendAgain'),
    tryAgain: t('form.tryAgain'),
    errors: {
      invalid_email: t('form.errors.invalidEmail'),
      send_failed: t('form.errors.sendFailed'),
      // Both limits count in fixed windows of an hour (src/lib/rate-limit.ts),
      // and the one per IP can trip before any link went to this address.
      rate_limited: t('form.errors.rateLimited'),
    },
    code: {
      label: t('code.label'),
      hint: t('code.hint'),
      submit: t('code.submit'),
      checking: t('code.checking'),
      errors: {
        no_email: t('code.errors.noEmail'),
        rate_limited: t('code.errors.rateLimited'),
        expired: t('code.errors.expired'),
        wrong: t('code.errors.wrong'),
        failed: t('code.errors.failed'),
      },
    },
  };
}
