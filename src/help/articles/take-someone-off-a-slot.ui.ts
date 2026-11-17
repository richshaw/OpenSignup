/**
 * Every on-screen name "Take someone off a slot" relies on. The article prints
 * them and its walkthrough (`tests/e2e/help/take-someone-off-a-slot.spec.ts`)
 * finds them by the same strings, so renaming one on screen fails that test
 * until it's changed here. No imports: the Playwright runner loads this file
 * too.
 */
export const UI = {
  // The organizer's home page, which lists their signups.
  yourSignups: 'Your signups',
  // The tab reads "Responses 2"; the count changes, so the test matches the start.
  responses: 'Responses',
  // Each row's button (on a phone, each card's) shows Remove; its full name
  // adds the person and the slot.
  remove: 'Remove',
  // The confirmation's buttons.
  keep: 'Keep',
  yesRemove: 'Yes, remove',
  // The row's Status once they are off the slot.
  removed: 'removed',
  // What the person's own link shows afterwards (CANCELLED_PAGE.removed).
  removedPage: 'The organizer took you off this slot',
} as const;

/**
 * Where each name above is in the English catalog (src/messages/en.json):
 * the key of the message the control shows, with its placeholders' values
 * where it has any, or a list where one name stands for several controls.
 * src/help/ui-names.test.ts checks each name is that message's English, so
 * a reworded message fails it until the name, and the article, change with
 * it. Null for a name whose text isn't in the catalog.
 */
type FromCatalog = string | { key: string; values: Readonly<Record<string, string>> };
export const FROM_CATALOG: {
  readonly [Name in keyof typeof UI]: FromCatalog | readonly FromCatalog[] | null;
} = {
  yourSignups: 'organizer.dashboard.title',
  responses: 'organizer.signup.tabs.responses',
  remove: 'organizer.responses.remove.button',
  keep: 'organizer.responses.remove.keep',
  yesRemove: 'organizer.responses.remove.confirm',
  removed: 'organizer.responses.status.removed',
  removedPage: 'participant.cancelledPage.removed.title',
};
