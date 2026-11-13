import Link from 'next/link';
import { INSTANCE_NAME } from '@/lib/site-config';

/** The site name at the top of a page outside the organizer app, linking home. */
export function SiteHeader() {
  return (
    <header className="flex items-center justify-between px-5 py-5 lg:px-12 lg:py-6">
      <Link href="/" className="text-lg font-semibold tracking-tight lg:text-xl">
        {INSTANCE_NAME}
      </Link>
    </header>
  );
}
