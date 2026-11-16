/**
 * Every on-screen name "Connect an AI assistant" relies on. The article prints
 * them and its walkthrough (`tests/e2e/help/connect-an-ai-assistant.spec.ts`)
 * finds them by the same strings, so renaming one on screen fails that test
 * until it's changed here. No imports: the Playwright runner loads this file
 * too.
 */
export const UI = {
  // Where a signup the assistant made shows up, marked draft.
  yourSignups: 'Your signups',
  // The header link reads as your email address on a wide screen and as this
  // on a phone.
  account: 'Account',
  // The page that link opens, by its heading.
  settings: 'Settings',
  connectedApps: 'Connected apps',
  disconnect: 'Disconnect',
  // What the approval page says instead, once its request has run out.
  expired: 'This connection request has expired',
  // The approval page.
  willBeAbleTo: 'It will be able to',
  allow: 'Allow',
  dontAllow: "Don't allow",
  // Permissions, as the approval page and Connected apps list them
  // (`auth.scopes` in src/messages/en.json).
  seeSignups: 'See your signups and their slots',
  editSignups: 'Create and edit signups',
  seePeople: 'See who has signed up, including their names and email addresses',
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
  account: 'organizer.chrome.account',
  settings: 'organizer.settings.title',
  connectedApps: ['organizer.settings.connectedApps.title', 'organizer.connectedApps.title'],
  disconnect: 'organizer.connectedApps.disconnect',
  expired: 'auth.consent.expired.heading',
  willBeAbleTo: 'auth.consent.permissions',
  allow: 'auth.consent.allow',
  dontAllow: 'auth.consent.deny',
  seeSignups: 'auth.scopes.signupsRead',
  editSignups: 'auth.scopes.signupsWrite',
  seePeople: 'auth.scopes.commitmentsRead',
};
