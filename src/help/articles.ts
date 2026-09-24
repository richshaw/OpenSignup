/**
 * The help articles served at `/help/[slug]`, in the order the index lists
 * them. Metadata only, with no JSX, so the sitemap can read it without pulling
 * in page bodies; each body lives in `src/help/articles/` and is wired up in
 * `bodies.tsx`, whose `Record<HelpSlug, …>` type makes a missing body a type
 * error. How to write one: `docs/writing-help.md`.
 */
export interface HelpArticleMeta {
  slug: string;
  /** The task, in the reader's words, starting with a verb. */
  title: string;
  /** One sentence: what the reader has when they finish. */
  summary: string;
}

export const HELP_ARTICLES = [
  {
    slug: 'create-and-publish-a-signup',
    title: 'Create and publish your first signup',
    summary: 'Make a signup, add the slots people can take, and share the link.',
  },
] as const satisfies readonly HelpArticleMeta[];

export type HelpSlug = (typeof HELP_ARTICLES)[number]['slug'];

export function findHelpArticle(slug: string): (typeof HELP_ARTICLES)[number] | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug);
}
