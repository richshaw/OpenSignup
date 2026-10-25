/**
 * Every on-screen name "Create and publish your first signup" relies on. The
 * article prints them and its walkthrough (`tests/e2e/help/`) finds them by
 * the same strings, so renaming one of these on screen fails that test until
 * it is changed here, and the article changes with it. No imports: the
 * Playwright runner loads this file too.
 */
export const UI = {
  yourSignups: 'Your signups',
  newSignup: 'New signup',
  // Only on sites that offer drafting from a description.
  composeHeading: 'What are you organizing?',
  skipCompose: 'Skip, fill in by hand',
  draftCompose: 'Draft my signup',
  title: 'Title',
  description: 'Description (optional)',
  createSignup: 'Create signup',
  // Under a draft's title, where a published signup's link is.
  draftOnly: 'Only you can see this draft until you publish it.',
  emptySlot: 'Set what',
  what: 'What',
  date: 'Date',
  spots: 'Spots',
  done: 'Done',
  addSlot: 'Add a slot',
  duplicate: 'Duplicate',
  delete: 'Delete',
  // What people see on the signup page for a slot left empty.
  untitledSlot: 'Untitled slot',
  // At the top on a computer; on a phone, in the three dots' sheet.
  preview: 'Preview',
  // At the top on a computer; on a phone, in the bar at the bottom of the screen.
  publish: 'Publish and share',
  // What Publish says, by its heading, when every slot is empty, and its fix.
  nothingYet: 'Nothing to sign up for yet',
  fillItIn: 'Fill it in',
  // What Publish says when a slot still says TBD, by its heading, and its two choices.
  beforePeopleSee: 'Before people see it',
  nameItFirst: 'Name it first',
  publishAnyway: 'Publish anyway',
  // By a slot that still says TBD (or TBC, TBA, with that word) on the Build
  // tab: on a draft, then once it's published. Only the first is in the
  // walkthrough; a unit test checks both.
  stillSays: 'Still says “TBD”',
  peopleCanSee: 'People can see “TBD”',
  // The tab a signup opens on, where its slots are.
  build: 'Build',
  // Phones: the three-dot button's accessible name.
  moreActions: 'More actions',
  publicLink: 'Public link',
  // An icon-only button: the article says "the copy button"; the test uses this.
  copyPublicLink: 'Copy public link',
  // The panel Publish opens, by its heading, and what it offers.
  sendTheLink: 'Now send people the link',
  copyLink: 'Copy link',
  copyMessage: 'Copy message',
  emailIt: 'Email it',
  // The QR code's button on a computer, then on a phone (which says Hide QR
  // code while the code shows), and the button under the code a phone shows.
  downloadQr: 'Download',
  qrOnPhone: 'QR code',
  hideQrCode: 'Hide QR code',
  saveImage: 'Save image',
  // Only on phones with a share menu, so a unit test checks it, not the walkthrough.
  shareOnPhone: 'Share…',
  // An open signup's button where Publish and share was, which opens the panel again.
  share: 'Share',
  // On the signup page people open: each slot's button starts with this.
  signUp: 'Sign up',
  // The button reads "Fields (2)"; the count changes, so the test matches the start.
  fields: 'Fields',
  reminderToggle: 'Send a reminder email before this date',
  // The Fields dialog's button, and the Settings tab's.
  save: 'Save',
  // The Settings tab, and its choice of whether people must give an email.
  settings: 'Settings',
  signupForm: 'Sign-up form',
  askForEmail: 'Ask for an email address',
  emailRequired: 'Required',
  emailOptional: 'Optional',
  saved: 'Saved',
  // The email box on the signup page once it is optional.
  emailBoxOptional: 'Email (optional)',
  // The tab that lists who signed up.
  responses: 'Responses',
} as const;
