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
  // The questions drafting may ask before it drafts, by their heading; their
  // button is draftCompose again. The walkthrough never reaches them (CI runs
  // without an AI), so create-and-publish-a-signup.test.tsx renders that screen
  // and checks both names instead.
  questionsHeading: 'A few details first',
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
  // Phones: the three-dot button's accessible name.
  moreActions: 'More actions',
  publicLink: 'Public link',
  // The signup's status at the top of the page, once people can sign up on it.
  open: 'open',
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
  // The Settings tab's card that says whether reminders are on.
  reminders: 'Reminders',
  saved: 'Saved',
  // The email box on the signup page once it is optional.
  emailBoxOptional: 'Email (optional)',
  // The Settings tab's language choice, by its group's name.
  signupLanguage: 'Signup language',
  // The header link to the organizer's own settings on a phone (a computer
  // shows their email address), and the language choice there.
  account: 'Account',
  language: 'Language',
  // The tab that lists who signed up.
  responses: 'Responses',
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
  newSignup: 'organizer.dashboard.newSignup',
  composeHeading: 'organizer.compose.heading',
  skipCompose: 'organizer.compose.skip',
  draftCompose: 'organizer.compose.draft',
  questionsHeading: 'organizer.compose.questions.heading',
  title: 'organizer.newSignup.titleLabel',
  description: 'organizer.newSignup.descriptionLabel',
  createSignup: 'organizer.newSignup.create',
  draftOnly: 'organizer.signup.draftLine',
  // The empty slot's placeholder names its first field, lowercased.
  emptySlot: { key: 'organizer.build.empty.named', values: { label: 'what' } },
  // A new signup's fields, named in its language.
  what: 'participant.defaults.what',
  date: 'participant.defaults.date',
  spots: 'organizer.build.editor.spots',
  done: 'organizer.build.editor.done',
  addSlot: 'organizer.build.group.addSlot',
  duplicate: 'organizer.build.editor.duplicate',
  delete: 'organizer.build.editor.delete',
  untitledSlot: 'participant.signupView.untitledSlot',
  preview: 'organizer.signup.preview',
  publish: 'organizer.signup.publish.label',
  nothingYet: 'organizer.signup.check.title',
  fillItIn: 'organizer.signup.check.fillIn',
  moreActions: 'organizer.signup.moreActions',
  publicLink: ['organizer.share.chip.label', 'organizer.share.linkField'],
  open: 'organizer.status.open',
  copyPublicLink: 'organizer.share.chip.copy',
  sendTheLink: 'organizer.share.heading.firstTime',
  copyLink: 'organizer.share.copyLink',
  copyMessage: 'organizer.share.copyMessage',
  emailIt: 'organizer.share.emailIt',
  downloadQr: 'organizer.share.qr.download',
  qrOnPhone: 'organizer.share.qr.show',
  hideQrCode: 'organizer.share.qr.hide',
  saveImage: 'organizer.share.qr.save',
  shareOnPhone: 'organizer.share.shareMenu',
  share: 'organizer.share.button',
  signUp: 'participant.dialog.signUp',
  fields: 'organizer.build.fields.label',
  reminderToggle: 'organizer.build.fieldForm.reminder',
  save: ['organizer.build.fieldForm.save', 'organizer.signupSettings.save'],
  settings: 'organizer.signup.tabs.settings',
  signupForm: 'organizer.signupSettings.signupForm.title',
  askForEmail: 'organizer.signupSettings.signupForm.askForEmail',
  emailRequired: 'organizer.signupSettings.signupForm.required',
  emailOptional: 'organizer.signupSettings.signupForm.optional',
  reminders: 'organizer.signupSettings.reminders.title',
  saved: 'organizer.saveNotice.saved',
  emailBoxOptional: 'participant.fields.emailOptional',
  signupLanguage: 'organizer.signupSettings.language.legend',
  account: 'organizer.chrome.account',
  language: 'organizer.settings.language.legend',
  responses: 'organizer.signup.tabs.responses',
};
