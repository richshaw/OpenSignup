import type { Metadata } from 'next';
import Link from 'next/link';
import { HELP_ARTICLES } from '@/help/articles';
import { HelpContact } from '@/help/contact';
import { INSTANCE_NAME } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Help',
  description: `Short guides to making signups on ${INSTANCE_NAME}.`,
  alternates: { canonical: '/help' },
};

export default function HelpIndexPage() {
  return (
    <>
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Help</h1>
        <p className="text-ink-muted">
          Short guides for people who make signups. If someone sent you a link to sign up, you
          don&apos;t need an account. Open the link and choose a slot.
        </p>
      </header>

      <ul className="divide-y divide-surface-sunk overflow-hidden rounded-xl border border-surface-sunk bg-white">
        {HELP_ARTICLES.map((a) => (
          <li key={a.slug}>
            <Link
              href={`/help/${a.slug}`}
              className="block px-5 py-4 transition hover:bg-surface-raised"
            >
              <p className="font-medium">{a.title}</p>
              <p className="text-sm text-ink-muted">{a.summary}</p>
            </Link>
          </li>
        ))}
      </ul>

      <HelpContact />
    </>
  );
}
