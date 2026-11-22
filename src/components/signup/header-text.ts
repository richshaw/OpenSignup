import type { Translator } from '@/i18n/translator';

/**
 * The words the signup header's client components show, and the tabs' and
 * the closed box's under it, worked out on the server in the organizer's
 * language and passed in as props, so a signup's pages send the browser no
 * messages and no translator. The layout builds it once; each component
 * takes the part it shows, and the ones that hold others pass theirs on.
 */
export interface SignupHeaderText {
  /** The ⋯ by the title, on a computer and a phone, and the panel it opens. */
  moreActions: string;
  /** The ✕ of a phone's More actions sheet. */
  closeSheet: string;
  publish: PublishText;
  close: CloseText;
  reopen: ReopenText;
  /** What the header says once Close signup or Reopen signup has done it. */
  announcements: { closed: string; reopened: string };
  /** The grey Signup closed box: its title, its text, its help link's and its ✕'s names. */
  closedNotice: { title: string; body: string; help: string; dismiss: string };
  /** Each tab's name, and the strip's. */
  tabs: { strip: string; build: string; responses: string; settings: string };
}

/** Publish and share, and what it says and shows around it. */
export interface PublishText {
  label: string;
  /** Its busy label, while it saves and checks. */
  checking: string;
  /** Said when a check's fix gives it the focus back. */
  ready: string;
  /** Its refusal when a change on the Build tab didn't save. */
  unsaved: string;
  /** The ✕ of the check's sheet on a phone. */
  closeSheet: string;
}

/** Close signup, and its question's two buttons. */
export interface CloseText {
  action: string;
  notYet: string;
  closing: string;
}

/** Reopen signup, and its busy label. */
export interface ReopenText {
  action: string;
  reopening: string;
}

export function signupHeaderText(t: Translator<'organizer.signup'>): SignupHeaderText {
  const closeSheet = t('closeSheet');
  return {
    moreActions: t('moreActions'),
    closeSheet,
    publish: {
      label: t('publish.label'),
      checking: t('publish.checking'),
      ready: t('publish.ready'),
      unsaved: t('publish.unsaved'),
      closeSheet,
    },
    close: {
      action: t('close.action'),
      notYet: t('close.notYet'),
      closing: t('close.closing'),
    },
    reopen: {
      action: t('reopen.action'),
      reopening: t('reopen.reopening'),
    },
    announcements: { closed: t('announce.closed'), reopened: t('announce.reopened') },
    closedNotice: {
      title: t('closed.title'),
      body: t('closed.body'),
      help: t('closed.help'),
      dismiss: t('closed.dismiss'),
    },
    tabs: {
      strip: t('tabs.label'),
      build: t('tabs.build'),
      responses: t('tabs.responses'),
      settings: t('tabs.settings'),
    },
  };
}
