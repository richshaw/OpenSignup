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
  // on a phone. Both open the same page, whose heading is also this.
  settings: 'Settings',
  connectedApps: 'Connected apps',
  disconnect: 'Disconnect',
  // The approval page.
  willBeAbleTo: 'It will be able to',
  allow: 'Allow',
  dontAllow: "Don't allow",
  // Permissions, as the approval page and Connected apps list them
  // (SCOPE_DESCRIPTIONS in src/oauth/scopes.ts).
  seeSignups: 'See your signups and their slots',
  editSignups: 'Create and edit signups',
  seePeople: 'See who has signed up, including their names and email addresses',
} as const;
