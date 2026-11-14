import { SiteFooter } from '@/components/site-footer';
import { RootShell, rootMetadata, rootViewport } from '../../root-shell';

export const metadata = rootMetadata;
export const viewport = rootViewport;

/**
 * The root layout for a signup's pages: the signup itself, an edit link and
 * unsubscribe. English until signups have a language of their own, when it
 * becomes the signup's (#628).
 */
export default function ParticipantLayout({ children }: { children: React.ReactNode }) {
  return (
    <RootShell lang="en">
      <div className="flex min-h-[100svh] flex-col bg-surface text-ink">
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </div>
    </RootShell>
  );
}
