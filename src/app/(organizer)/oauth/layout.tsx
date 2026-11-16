import { getOrganizerSession } from '@/auth/session';
import { localeOfOrganizer } from '@/i18n/locale';
import { RootShell, rootMetadata, rootViewport } from '../../root-shell';

export const metadata = rootMetadata;
export const viewport = rootViewport;

/**
 * The root layout for the AI assistant's consent screen (`/oauth/consent`),
 * in the organizer's language (`localeOfOrganizer`), as the screen's text is:
 * they're signed in by then. With nobody signed in, the page says the request
 * can't go on, or sends them to sign in, in the site default, else English,
 * and so does this. The page reads the session itself, and the read is
 * cached for the request, so this costs no statement. `../app/layout.tsx`
 * says why the sign-in pages have a root layout of their own.
 *
 * The provider's error pages aren't under it: they're HTML the provider
 * writes (`src/oauth/provider.ts`), in the sign-in pages' language.
 */
export default async function ConsentLayout({ children }: { children: React.ReactNode }) {
  return <RootShell lang={localeOfOrganizer(await getOrganizerSession())}>{children}</RootShell>;
}
