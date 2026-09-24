import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { HELP_ARTICLES, findHelpArticle } from '@/help/articles';
import { HELP_BODIES } from '@/help/bodies';
import { HelpContact } from '@/help/contact';

type PageParams = { params: Promise<{ slug: string }> };

// Only the articles in HELP_ARTICLES exist; anything else is the site's 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return HELP_ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const article = findHelpArticle((await params).slug);
  if (!article) return {};
  return {
    title: article.title,
    description: article.summary,
    alternates: { canonical: `/help/${article.slug}` },
  };
}

export default async function HelpArticlePage({ params }: PageParams) {
  const article = findHelpArticle((await params).slug);
  if (!article) notFound();
  const { Body } = HELP_BODIES[article.slug];
  return (
    <>
      <header className="space-y-2">
        <Link href="/help" className="text-sm text-ink-muted transition hover:text-ink">
          Help
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{article.title}</h1>
      </header>
      <Body />
      <HelpContact />
    </>
  );
}
