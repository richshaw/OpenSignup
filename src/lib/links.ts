import { getEnv } from './env';

export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface LinkObject {
  href: string;
  method: Method;
}

export function link(href: string, method: Method = 'GET'): LinkObject {
  return { href, method };
}

/** `path` (starting with `/`) on this site, whether or not the configured origin ends in a slash. */
function absoluteUrl(path: string): string {
  return `${getEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}${path}`;
}

export function publicSignupUrl(slug: string): string {
  return absoluteUrl(`/s/${slug}`);
}

/** The organizer's build page for a signup, absolute so an assistant can hand it to a person. */
export function buildPageUrl(signupId: string): string {
  return absoluteUrl(`/app/signups/${signupId}/build`);
}

/** The organizer's preview of the public page, which works while the signup is still a draft. */
export function previewPageUrl(signupId: string): string {
  return absoluteUrl(`/app/signups/${signupId}/preview`);
}

/** A sign-up's edit page path, relative so a redirect stays on the origin the person came in on. */
export function commitmentEditPath(slug: string, commitmentId: string, token: string): string {
  return `/s/${slug}/c/${encodeURIComponent(commitmentId)}?token=${encodeURIComponent(token)}`;
}

export function commitmentEditUrl(slug: string, commitmentId: string, token: string): string {
  return absoluteUrl(commitmentEditPath(slug, commitmentId, token));
}

/**
 * A new commitment's edit page URL and its `_links`, as signing up and moving a
 * sign-up both return them. `self` and `cancel` stay relative, like the rest of
 * the API's links.
 */
export function commitmentLinks(
  slug: string,
  commitmentId: string,
  token: string,
): {
  editUrl: string;
  links: { edit: LinkObject; self: LinkObject; cancel: LinkObject };
} {
  const editUrl = commitmentEditUrl(slug, commitmentId, token);
  const self = `/api/commitments/${commitmentId}?token=${token}`;
  return {
    editUrl,
    links: { edit: link(editUrl), self: link(self), cancel: link(self, 'DELETE') },
  };
}

/** The credentials every reminder opt-out link carries, encoded so neither can add a parameter. */
function optOutQuery(participantId: string, token: string): string {
  return `p=${encodeURIComponent(participantId)}&token=${encodeURIComponent(token)}`;
}

/** What the opt-out route tells the confirm page after a submit. */
export type UnsubscribeStatus = 'done=on' | 'done=off' | 'error=on' | 'error=off';

/**
 * The reminder opt-out confirm page's path, which the email links to and the
 * redirects send people back to, with the outcome of a submit when there is one.
 */
export function unsubscribePath(
  slug: string,
  participantId: string,
  token: string,
  status?: UnsubscribeStatus,
): string {
  const query = optOutQuery(participantId, token);
  return `/s/${slug}/unsubscribe?${status ? `${query}&${status}` : query}`;
}

/** Human-visible link: lands on a confirm page, opts out only on submit. */
export function reminderUnsubscribeUrl(slug: string, participantId: string, token: string): string {
  return absoluteUrl(unsubscribePath(slug, participantId, token));
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
  return absoluteUrl(`/api/public/reminder-optout?${optOutQuery(participantId, token)}`);
}
