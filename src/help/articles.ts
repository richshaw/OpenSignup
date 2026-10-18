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
  /**
   * The page's meta description, for search results and link previews:
   * between 110 and 160 characters, like the site's own in `src/app/layout.tsx`.
   * `summary` stays short for the list on `/help`.
   */
  description: string;
}

/** The meta description of `/help` itself, held to the same length. */
export const HELP_INDEX_DESCRIPTION =
  'Step-by-step guides for people who make signups: create and publish one, take someone off a slot, and let an AI assistant do the work for you.';

export const HELP_ARTICLES = [
  {
    slug: 'create-and-publish-a-signup',
    title: 'Create and publish your first signup',
    summary: 'Create a signup, add the slots people can take, then publish it and share the link.',
    description:
      'Make your first signup step by step: give it a title, add the slots people can take, then publish it and share the link. People need no account.',
  },
  {
    slug: 'take-someone-off-a-slot',
    title: 'Take someone off a slot',
    summary: 'Remove one person from a slot, so their spot opens up for someone else.',
    description:
      'Remove one person from a slot on your signup, so their spot opens up for someone else. Everyone else stays signed up, and the person you remove gets no email.',
  },
  {
    slug: 'connect-an-ai-assistant',
    title: 'Connect an AI assistant',
    summary:
      'Let Claude, ChatGPT or another AI assistant make and change signups for you, and disconnect it when you want.',
    description:
      'Connect Claude, ChatGPT or another AI assistant to your account so it can make and change signups for you. See what it can do, and disconnect it.',
  },
] as const satisfies readonly HelpArticleMeta[];

export type HelpSlug = (typeof HELP_ARTICLES)[number]['slug'];

export function findHelpArticle(slug: string): (typeof HELP_ARTICLES)[number] | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug);
}
