import { describe, expect, it } from 'vitest';
import { renderEmail } from '../render';
import { ReminderEmail } from './reminder';
import { SlotChangedEmail } from './slot-changed';

const unsubscribeUrl = 'https://example.com/s/bake-sale/unsubscribe?t=fake-token';

const props = {
  participantName: 'Pat',
  signupTitle: 'Bake sale',
  manageUrl: 'https://example.com/s/bake-sale/c/fake',
  slotDetails: [{ label: 'What', value: 'Cookies' }],
  slotSummary: 'Cookies',
  unsubscribeUrl,
};

/**
 * Nothing may follow the opt-out link: in plaintext react-email prints it as
 * "label\nURL", and clients that autolink plaintext swallow any trailing
 * punctuation into the URL.
 */
describe('unsubscribe footer', () => {
  it.each([
    ['reminder', <ReminderEmail key="r" {...props} />, 'Stop reminders for Bake sale'],
    [
      'slot-changed',
      <SlotChangedEmail key="s" {...props} />,
      'Stop reminders and updates for Bake sale',
    ],
  ])('ends the %s email with the link label and its URL', async (_name, email, label) => {
    const { text, html } = await renderEmail(email);
    const footer = `You'll still get a confirmation if you sign up for something new. ${label} ${unsubscribeUrl}`;
    // Plaintext wraps at 80 columns, so any space may come out as a newline.
    expect(text.replace(/\s+/g, ' ').trimEnd().endsWith(footer)).toBe(true);
    expect(html).toContain(`href="${unsubscribeUrl}"`);
  });
});
