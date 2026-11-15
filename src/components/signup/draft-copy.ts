/**
 * What a draft shows where a published signup shows its public link: under
 * the title in the signup's header. Its own module so pages can share the
 * words without importing the header.
 *
 * Its row in Your signups (`organizer.dashboard.draftOnlyYou`) and the title
 * its own organizer sees on its public link
 * (`organizer.publicPage.ownDraft.title`) say the same from the organizer
 * catalog, and tests check they agree (src/app/s/[slug]/page.test.tsx,
 * src/components/signup/draft-copy.test.ts). This moves into the catalog
 * with the rest of the header's text.
 */
export const DRAFT_ONLY_YOU = 'Only you can see this draft';
