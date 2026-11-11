import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

/** The frame around the legal and help pages: site name, one text column, footer. */
export function PublicPageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100svh] flex-col bg-surface text-ink">
      <SiteHeader />
      <main className="container-tight flex-1 pb-16 pt-4">
        <article className="space-y-6 text-[15px] leading-relaxed">{children}</article>
      </main>
      <SiteFooter />
    </div>
  );
}
