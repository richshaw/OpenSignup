import { getOrganizerSession } from '@/auth/session';
import { localeOfOrganizer } from '@/i18n/locale';
import { RootShell, rootMetadata, rootViewport } from '../../root-shell';

export const metadata = rootMetadata;
export const viewport = rootViewport;

/**
 * The root layout for the organizer app (`/app`), in the organizer's language
 * (`localeOfOrganizer`), as its pages' text is. With nobody signed in, it's
 * the language of an account with none stored, the site default, else
 * English, which is what the page that sends them to sign in is in.
 *
 * Every page here reads the session itself (`requireOrganizerSession`), and
 * the read is cached for the request, so this costs no statement. Sign-in's
 * check and confirm pages read none, and must not start to, so the sign-in
 * pages have a root layout of their own (`../login/layout.tsx`), and so does
 * the AI assistant's consent screen (`../oauth/layout.tsx`), which is in the
 * organizer's language too.
 *
 * A root layout isn't rendered again on a client-side navigation, but the
 * language only changes when the organizer saves one in account Settings,
 * and a server action that redirects renders the page it goes to whole, this
 * layout included. Going to or from sign-in or the consent screen crosses
 * root layouts, which loads the whole page.
 */
export default async function OrganizerAppLayout({ children }: { children: React.ReactNode }) {
  return <RootShell lang={localeOfOrganizer(await getOrganizerSession())}>{children}</RootShell>;
}
