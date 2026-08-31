import { createElement } from 'react';
import { getEmailTransport } from './index';
import {
  CommitmentConfirmationEmail,
  type CommitmentConfirmationEmailProps,
} from './templates/commitment-confirmation';
import { ReminderEmail, type ReminderEmailProps } from './templates/reminder';
import { renderEmail } from './render';

export async function sendCommitmentConfirmation(
  to: string,
  props: CommitmentConfirmationEmailProps,
) {
  const { html, text } = await renderEmail(createElement(CommitmentConfirmationEmail, props));
  return getEmailTransport().send({
    to,
    subject: `You're signed up: ${props.slotLabel} · ${props.signupTitle}`,
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
