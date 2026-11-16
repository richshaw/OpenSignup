import type { Translator } from '@/i18n/translator';

/**
 * The words of the share panel and of what opens it, worked out on the server
 * in the organizer's language and passed in as props, as the rest of the
 * signup header's are (`signupHeaderText`), so a signup's pages send the
 * browser no messages and no translator. `SignupHeader` builds it once and
 * gives it to `ShareScope`, which holds it for both headers' Share buttons
 * and the panel they open. The message the panel offers to send isn't here:
 * participants read it, so it's in the signup's language (`shareMessage`).
 */
export interface ShareText {
  /** Share, the header's button. */
  button: string;
  /** The ✕ that closes the popover or the sheet. */
  close: string;
  /** The panel's heading: after Publish, and when Share opens it later. */
  heading: { firstTime: string; later: string };
  /** The small green mark over the heading, after Publish. */
  published: string;
  /** What screen readers hear once Publish on this page has published. */
  announce: string;
  panel: SharePanelText;
}

/** The panel's own words, which load with it; see `SharePanel`. */
export interface SharePanelText {
  /** The line under the heading: after Publish, and later on a computer or a phone. */
  lead: { firstTime: string; desktop: string; phone: string };
  /** The name of the box the link is in. */
  linkField: string;
  copyLink: string;
  /** What Copy link and Copy message say once they've copied. */
  copied: string;
  /** Said once the link is copied. */
  linkCopied: string;
  /** Said once the message is copied. */
  messageCopied: string;
  /** Shown when the clipboard refuses the link. */
  linkRefused: string;
  /** Shown when the clipboard refuses the message. */
  messageRefused: string;
  /** The message box's label. */
  messageLabel: string;
  copyMessage: string;
  emailIt: string;
  /** Share…, on a phone with a share menu, and the line under it, before and after. */
  shareMenu: string;
  shareMenuHint: string;
  shareMenuSent: string;
  /** What shows by the link when the rest of the panel couldn't load. */
  unavailable: string;
  chip: PublicLinkChipText;
  qr: ShareQrText;
}

/** The QR code's words, on a computer and a phone. */
export interface ShareQrText {
  /** The code's name, with the signup's title in it. */
  alt: string;
  /** The line beside the small code on a computer, and its Download. */
  lead: string;
  download: string;
  downloadLabel: string;
  /** A phone's button, while the code is hidden and while it shows. */
  show: string;
  hide: string;
  /** Under the large code on a phone, before and after, and what's said. */
  save: string;
  saved: string;
  savedNotice: string;
}

/** The public link's chip, in the header and where the panel couldn't load. */
export interface PublicLinkChipText {
  label: string;
  /** The copy button's name, and its tip. */
  copy: string;
  copyTip: string;
  /** The open button's name, and its tip. */
  open: string;
  openTip: string;
  /** Said once the link is copied. */
  copied: string;
}

/** The words for the share panel of the signup called `title`, from `t`. */
export function shareText(t: Translator<'organizer.share'>, title: string): ShareText {
  return {
    button: t('button'),
    close: t('close'),
    heading: { firstTime: t('heading.firstTime'), later: t('heading.later') },
    published: t('published'),
    announce: t('announce'),
    panel: {
      lead: {
        firstTime: t('lead.firstTime'),
        desktop: t('lead.desktop'),
        phone: t('lead.phone'),
      },
      linkField: t('linkField'),
      copyLink: t('copyLink'),
      copied: t('copied'),
      linkCopied: t('linkCopied'),
      messageCopied: t('messageCopied'),
      linkRefused: t('linkRefused'),
      messageRefused: t('messageRefused'),
      messageLabel: t('messageLabel'),
      copyMessage: t('copyMessage'),
      emailIt: t('emailIt'),
      shareMenu: t('shareMenu'),
      shareMenuHint: t('shareMenuHint'),
      shareMenuSent: t('shareMenuSent'),
      unavailable: t('unavailable'),
      chip: {
        label: t('chip.label'),
        copy: t('chip.copy'),
        copyTip: t('chip.copyTip'),
        open: t('chip.open'),
        openTip: t('chip.openTip'),
        copied: t('chip.copied'),
      },
      qr: {
        alt: t('qr.alt', { title: title.trim() }),
        lead: t('qr.lead'),
        download: t('qr.download'),
        downloadLabel: t('qr.downloadLabel'),
        show: t('qr.show'),
        hide: t('qr.hide'),
        save: t('qr.save'),
        saved: t('qr.saved'),
        savedNotice: t('qr.savedNotice'),
      },
    },
  };
}
