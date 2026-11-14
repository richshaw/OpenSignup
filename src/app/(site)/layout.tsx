import { RootShell, rootMetadata, rootViewport } from '../root-shell';

export const metadata = rootMetadata;
export const viewport = rootViewport;

/**
 * The root layout for the home page, help and legal pages. English: their
 * text isn't translated yet. Nothing here may read the request, because help
 * and legal are prerendered (`force-static` in their own layouts).
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <RootShell lang="en">{children}</RootShell>;
}
