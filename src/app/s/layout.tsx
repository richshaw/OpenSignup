import { SiteFooter } from '@/components/site-footer';

export default function PublicParticipantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface text-ink flex min-h-[100svh] flex-col">
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
