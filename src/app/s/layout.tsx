import { SiteFooter } from '@/components/site-footer';

export default function PublicParticipantLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100svh] flex-col bg-surface text-ink">
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
