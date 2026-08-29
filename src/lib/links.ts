import { getEnv } from './env';

export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface LinkObject {
  href: string;
  method: Method;
}

export function link(href: string, method: Method = 'GET'): LinkObject {
  return { href, method };
}

export function publicSignupUrl(slug: string): string {
  const env = getEnv();
  return `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/s/${slug}`;
}

export function commitmentEditUrl(slug: string, commitmentId: string, token: string): string {
  const env = getEnv();
  return `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/s/${slug}/c/${commitmentId}?token=${token}`;
}

/** Human-visible link: lands on a confirm page, opts out only on submit. */
export function reminderUnsubscribeUrl(
  slug: string,
  participantId: string,
  token: string,
): string {
  const env = getEnv();
  return `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/s/${slug}/unsubscribe?p=${participantId}&token=${token}`;
}

/**
 * Target for `List-Unsubscribe` / RFC 8058 one-click.
 *
 * This MUST be the API route, not the confirm page: a mail provider POSTs here
 * unattended and reads only the status code. Pointed at the page, Next renders
 * the confirm HTML and returns 200 — the provider reports success to the user
 * while nothing is opted out, and repeated silent failures hurt sender
 * reputation at exactly the providers that offer the button.
 */
export function reminderUnsubscribePostUrl(participantId: string, token: string): string {
  const env = getEnv();
  return `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/api/public/reminder-optout?p=${participantId}&token=${token}`;
}
