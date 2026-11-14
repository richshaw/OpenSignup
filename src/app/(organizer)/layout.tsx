import { RootShell, rootMetadata, rootViewport } from '../root-shell';

export const metadata = rootMetadata;
export const viewport = rootViewport;

/**
 * The root layout for the organizer app (`/app`), sign-in (`/login`) and
 * OAuth consent (`/oauth`). English until organizers have a language of
 * their own (#619).
 */
export default function OrganizerLayout({ children }: { children: React.ReactNode }) {
  return <RootShell lang="en">{children}</RootShell>;
}
