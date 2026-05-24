import { SiteFooter } from '@/components/site-footer';

export default function PublicParticipantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <SiteFooter />
    </>
  );
}
