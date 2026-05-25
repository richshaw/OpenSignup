import Link from 'next/link';
import { SiteFooter } from '@/components/site-footer';
import { INSTANCE_NAME } from '@/lib/site-config';

export const dynamic = 'force-static';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface text-ink flex min-h-[100svh] flex-col">
      <header className="flex items-center justify-between px-5 py-5 lg:px-12 lg:py-6">
        <Link href="/" className="text-lg font-semibold tracking-tight lg:text-xl">
          {INSTANCE_NAME}
        </Link>
      </header>
      <main className="container-tight flex-1 pb-16 pt-4">
        <article className="space-y-6 text-[15px] leading-relaxed">{children}</article>
      </main>
      <SiteFooter />
    </div>
  );
}
