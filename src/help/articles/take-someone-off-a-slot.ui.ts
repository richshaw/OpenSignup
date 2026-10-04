/**
 * Every on-screen name "Take someone off a slot" relies on. The article prints
 * them and its walkthrough (`tests/e2e/help/take-someone-off-a-slot.spec.ts`)
 * finds them by the same strings, so renaming one on screen fails that test
 * until it's changed here. No imports: the Playwright runner loads this file
 * too.
 */
export const UI = {
  // The tab reads "Responses 2"; the count changes, so the test matches the start.
  responses: 'Responses',
  // Each row's button shows Remove; its full name adds the person and the slot.
  remove: 'Remove',
  // The confirmation's buttons.
  keep: 'Keep',
  yesRemove: 'Yes, remove',
  // The row's Status once they are off the slot.
  removed: 'removed',
  // What the person's own link shows afterwards (CANCELLED_PAGE.removed).
  removedPage: 'The organizer took you off this slot',
} as const;
