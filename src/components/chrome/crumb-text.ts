import { getOrganizerSession } from '@/auth/session';
import { getOrganizerAppLocale } from '@/i18n/organizer';
import { getServerTranslator } from '@/i18n/server';

/**
 * The crumbs' words, in the organizer app's language for whoever is signed
 * in, or null when nobody is: the page beside them sends a visitor to sign
 * in. Each crumb page asks for itself, as each organizer page does, since the
 * crumbs re-render on a client-side navigation and the layout around them
 * doesn't. The session is the page's own read, so it costs no statement.
 */
export async function crumbTranslator() {
  const session = await getOrganizerSession();
  if (!session) return null;
  return getServerTranslator(getOrganizerAppLocale(session), 'organizer.crumbs');
}
