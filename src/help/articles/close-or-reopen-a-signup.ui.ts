/**
 * Every on-screen name "Close or reopen a signup" relies on. The article prints
 * them and its walkthrough (`tests/e2e/help/close-or-reopen-a-signup.spec.ts`)
 * finds them by the same strings, so renaming one on screen fails that test
 * until it's changed here. No imports: the Playwright runner loads this file
 * too.
 */
export const UI = {
  // The organizer's home page, which lists their signups.
  yourSignups: 'Your signups',
  // An open signup's button at the top of the page on a computer, with the
  // three dots beside it. On a phone it's in the bar at the bottom.
  share: 'Share',
  // An icon-only button, the three dots: the article describes it in words,
  // and the walkthrough finds it by this name. On a computer it opens a panel
  // of the same name; on a phone, a sheet named after the signup.
  moreActions: 'More actions',
  // The three dots' item, and the red button under the message it then shows.
  closeSignup: 'Close signup',
  // The message's other button, which leaves the signup open.
  notYet: 'Not yet',
  // The signup's status, beside its title.
  closed: 'closed',
  open: 'open',
  // The grey box under the title right after you close a signup, by its heading.
  signupClosed: 'Signup closed',
  // A closed signup's button at the top of the page, beside Preview. On a
  // phone it's behind the three dots, under Preview.
  reopenSignup: 'Reopen signup',
  preview: 'Preview',
  // On the signup page people open: the heading of the box at the top, and
  // what each slot says in place of Sign up.
  closedForPeople: 'Closed',
} as const;
