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
  emptySlot: 'Set what',
  what: 'What',
  date: 'Date',
  capacity: 'Capacity',
  done: 'Done',
  addSlot: 'Add a slot',
  duplicate: 'Duplicate',
  delete: 'Delete',
  // What people see on the signup page for a slot left empty.
  untitledSlot: 'Untitled slot',
  preview: 'Preview',
  publish: 'Publish',
  // Phones: the three-dot button's accessible name, then the item it opens.
  moreActions: 'More actions',
  publishOnPhone: 'Publish signup',
  publicLink: 'Public link',
  // An icon-only button: the article says "the copy button"; the test uses this.
  copyPublicLink: 'Copy public link',
  published: 'Signup published',
  // On the signup page people open: each slot's button starts with this.
  signUp: 'Sign up',
  // The button reads "Fields (2)"; the count changes, so the test matches the start.
  fields: 'Fields',
  reminderToggle: 'Send a reminder email before this date',
  save: 'Save',
} as const;
