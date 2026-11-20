/** The tabs of a signup's organizer pages, each a route under `/app/signups/<id>/`. */
export type SignupTab = 'build' | 'preview' | 'responses' | 'settings';

/**
 * The path of one of a signup's organizer tabs, relative so a link or a
 * redirect stays on the origin the organizer came in on.
 *
 * No imports: client components (the tab strip, Magic Compose) use it, and
 * `links.ts` would bring the server env into their bundles.
 */
export function signupTabPath(signupId: string, tab: SignupTab): string {
  return `/app/signups/${signupId}/${tab}`;
}
