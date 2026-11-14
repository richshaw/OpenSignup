import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/site-footer';
import { StateCard } from '@/components/state-card';
import { INSTANCE_NAME } from '@/lib/site-config';
import { NOT_FOUND_PAGE } from './not-found-message';
import { RootShell, rootMetadata, rootViewport } from './root-shell';

export const metadata: Metadata = {
  ...rootMetadata,
  title: `${NOT_FOUND_PAGE.tabTitle} · ${INSTANCE_NAME}`,
};
export const viewport = rootViewport;

/**
 * What an address no page matches gets, with a 404 (`globalNotFound` in
 * next.config.mjs). With three root layouts and none above them, nothing else
 * could give it a `<html lang>`. It renders outside every layout, so it brings
 * its own shell, and it's prerendered. A `notFound()` from a page renders the
 * nearest not-found page instead, inside the page's own root layout: a
 * signup's pages have theirs (`s/[slug]/not-found.tsx`).
 */
export default function GlobalNotFound() {
  return (
    <RootShell lang="en">
      <div className="flex min-h-[100svh] flex-col bg-surface text-ink">
        <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
          <StateCard
            title={NOT_FOUND_PAGE.title}
            body={NOT_FOUND_PAGE.body}
            className="container-tight"
          >
            <Link
              href={NOT_FOUND_PAGE.action.href}
              className="inline-block text-sm text-brand underline"
            >
              {NOT_FOUND_PAGE.action.label}
            </Link>
          </StateCard>
        </main>
        <SiteFooter />
      </div>
    </RootShell>
  );
}
