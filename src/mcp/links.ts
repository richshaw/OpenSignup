import { buildPageUrl, publicSignupUrl } from '@/lib/links';

/** Where a person can open the signup: the organizer's build page and the public page. */
export function signupLinks(row: { id: string; slug: string }): { build: string; public: string } {
  return { build: buildPageUrl(row.id), public: publicSignupUrl(row.slug) };
}
