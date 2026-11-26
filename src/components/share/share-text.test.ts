import { describe, expect, it } from 'vitest';
import { TEST_LOCALES } from '@/i18n/testing/locales';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import { shareText } from './share-text';

describe('shareText', () => {
  it('is the share panel’s English, word for word as it read before the catalog', () => {
    expect(shareText(getTestTranslator('organizer.share'), ' Bake sale helpers ')).toEqual({
      button: 'Share',
      close: 'Close',
      heading: { firstTime: 'Now send people the link', later: 'Share the link' },
      published: 'Published',
      announce: 'Published. Anyone with the link can sign up now.',
      panel: {
        lead: {
          firstTime: 'Anyone with the link can sign up. Nobody has it until you send it.',
          desktop: 'Send it by email or in a group chat. Anyone with the link can sign up.',
          phone: 'Send it to a group chat, by text or by email. Anyone with the link can sign up.',
        },
        linkField: 'Public link',
        copyLink: 'Copy link',
        copied: 'Copied',
        linkCopied: 'Link copied',
        messageCopied: 'Message copied',
        linkRefused: "Couldn't copy. Select the link and copy it.",
        messageRefused: "Couldn't copy. Select the message and copy it.",
        messageLabel: 'A message to send with it',
        copyMessage: 'Copy message',
        emailIt: 'Email it',
        shareMenu: 'Share…',
        shareMenuHint: "Opens your phone's share menu, with the message and link.",
        shareMenuSent: "Sent from your phone's share menu.",
        unavailable: "Couldn't load the other ways to share. Reload to try again.",
        chip: {
          label: 'Public link',
          copy: 'Copy public link',
          copyTip: 'Copy',
          open: 'Open public page',
          openTip: 'Open',
          copied: 'Link copied',
        },
        qr: {
          // The title as it's shown, without the spaces round it.
          alt: 'QR code for the sign-up link to Bake sale helpers',
          lead: 'A QR code for a flyer or a sign-up table.',
          download: 'Download',
          downloadLabel: 'Download QR code',
          show: 'QR code',
          hide: 'Hide QR code',
          save: 'Save image',
          saved: 'Saved',
          savedNotice: 'QR code saved',
        },
      },
    });
  });

  it.each(TEST_LOCALES)('asks the catalog in %s for every word', (locale) => {
    const text = shareText(getStandInTranslator(locale, 'organizer.share'), 'Bake sale');
    const words = (value: unknown): string[] =>
      typeof value === 'string' ? [value] : Object.values(value as object).flatMap(words);
    for (const word of words(text)) {
      expect(word).toMatch(new RegExp(`^organizer\\.share\\.[\\w.]+ in ${locale}$`));
    }
    expect(text.button).toBe(`organizer.share.button in ${locale}`);
    expect(text.panel.qr.alt).toBe(`organizer.share.qr.alt in ${locale}`);
    expect(text.panel.chip.copy).toBe(`organizer.share.chip.copy in ${locale}`);
  });
});
