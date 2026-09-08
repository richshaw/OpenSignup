import { createElement } from 'react';
import { getEmailTransport } from './index';
import { confirmationSubject, reminderSubject } from './subjects';
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
    subject: confirmationSubject(props.signupTitle, props.slotSummary),
    html,
    text,
  });
}

export async function sendReminder(
  to: string,
  props: ReminderEmailProps,
  /**
   * RFC 8058 one-click target. Deliberately separate from
   * `props.unsubscribeUrl`: that one is the human-visible link to a confirm
   * page, while this is POSTed unattended by the mail provider and must be the
   * API route that actually applies the opt-out.
   */
  opts: { unsubscribePostUrl?: string } = {},
) {
  const { html, text } = await renderEmail(createElement(ReminderEmail, props));
  return getEmailTransport().send({
    to,
    subject: reminderSubject(props.signupTitle, props.slotSummary),
    html,
    text,
    ...(opts.unsubscribePostUrl
      ? {
          headers: {
            'List-Unsubscribe': `<${opts.unsubscribePostUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        }
      : {}),
  });
}
