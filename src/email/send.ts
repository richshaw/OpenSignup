import { createElement } from 'react';
import { getEmailTransport } from './index';
import { MagicLinkEmail, type MagicLinkEmailProps } from './templates/magic-link';
import { ReminderEmail, type ReminderEmailProps } from './templates/reminder';
import { renderEmail } from './render';

export async function sendMagicLink(to: string, props: MagicLinkEmailProps) {
  const { html, text } = await renderEmail(createElement(MagicLinkEmail, props));
  return getEmailTransport().send({
    to,
    subject: 'Sign in to Signup',
    html,
    text,
  });
}

export async function sendReminder(to: string, props: ReminderEmailProps) {
  const { html, text } = await renderEmail(createElement(ReminderEmail, props));
  return getEmailTransport().send({
    to,
    subject: `Reminder: ${props.slotLabel} · ${props.signupTitle}`,
    html,
    text,
  });
}
