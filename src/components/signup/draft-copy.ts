/**
 * What a draft shows where a published signup shows its public link: under
 * the title in the signup's header and on its row in Your signups. Its own
 * module so those pages can share the words without importing the header.
 *
 * The title its own organizer sees on its public link says the same, from
 * the organizer catalog (`organizer.publicPage.ownDraft.title`), and
 * src/app/s/[slug]/page.test.tsx checks the two agree. This moves into the
 * catalog with the rest of the organizer app's text.
 */
export const DRAFT_ONLY_YOU = 'Only you can see this draft';
