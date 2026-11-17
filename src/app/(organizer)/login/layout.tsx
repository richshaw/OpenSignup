import { signInLocale } from '@/i18n/locale';
import { RootShell, rootMetadata, rootViewport } from '../../root-shell';

export const metadata = rootMetadata;
export const viewport = rootViewport;

/**
 * The root layout for the sign-in pages (`/login` and its check and confirm
 * pages), in the site default, else English (`signInLocale`), as their text
 * is: nobody is signed in on them yet. It reads no session, so a page that
 * reads none (check and confirm) doesn't start loading one, and an organizer
 * who opens one while signed in sees it in the language it's written in.
 * Signing in leaves for another root layout, which loads the whole page in
 * the organizer's language.
 */
export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return <RootShell lang={signInLocale()}>{children}</RootShell>;
}
