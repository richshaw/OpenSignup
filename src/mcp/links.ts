import { buildPageUrl, previewPageUrl, publicSignupUrl } from '@/lib/links';

/**
 * Where a person can open the signup. `edit` is the organizer's build page
 * (not /edit, which redirects to settings), `preview` shows the organizer what
 * participants will see even while it is a draft, and `public` is the page to
 * share once it is published.
 */
export function signupLinks(row: { id: string; slug: string }): {
  edit: string;
  preview: string;
  public: string;
} {
  return {
    edit: buildPageUrl(row.id),
    preview: previewPageUrl(row.id),
    public: publicSignupUrl(row.slug),
  };
}
