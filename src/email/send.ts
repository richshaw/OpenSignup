import { createElement } from 'react';
import { getEmailTransport } from './index';
import { toSendFailure } from './send-error';
import { subjectOf } from './subjects';
import {
  CommitmentConfirmationEmail,
  type CommitmentConfirmationEmailProps,
} from './templates/commitment-confirmation';
import { ReminderEmail, type ReminderEmailProps } from './templates/reminder';
import { SlotChangedEmail, type SlotChangedEmailProps } from './templates/slot-changed';
import { renderEmail } from './render';
import type { EmailMessage, EmailResult } from './transport';

/**
 * Sends through the configured transport. A refusal rejects with
 * `toSendFailure`'s copy of the transport's error rather than the error
 * itself: a mail server or Resend refusing a participant's address names it
 * (in nodemailer's `rejected` and `response`, or Resend's response body), and
 * the confirmation's catch and the worker's queues log what this rejects with.
 * It still rejects, so the worker's jobs still retry.
 */
function send(message: EmailMessage): Promise<EmailResult> {
  return getEmailTransport()
    .send(message)
    .catch((reason: unknown) => {
      throw toSendFailure(reason);
    });
}

/** RFC 8058 one-click unsubscribe headers, POSTing to `unsubscribePostUrl`. */
function unsubscribeHeaders(unsubscribePostUrl: string) {
  return {
    'List-Unsubscribe': `<${unsubscribePostUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

export async function sendCommitmentConfirmation(
  to: string,
  props: CommitmentConfirmationEmailProps,
) {
  const { html, text } = await renderEmail(createElement(CommitmentConfirmationEmail, props));
  return send({
    to,
    subject: subjectOf.confirmation(props),
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
  opts: { unsubscribePostUrl: string },
) {
  const { html, text } = await renderEmail(createElement(ReminderEmail, props));
  return send({
    to,
    subject: subjectOf.reminder(props),
    html,
    text,
    headers: unsubscribeHeaders(opts.unsubscribePostUrl),
  });
}

/** Same one-click unsubscribe as a reminder: one opt-out silences both. */
export async function sendSlotChanged(
  to: string,
  props: SlotChangedEmailProps,
  opts: { unsubscribePostUrl: string },
) {
  const { html, text } = await renderEmail(createElement(SlotChangedEmail, props));
  return send({
    to,
    subject: subjectOf.slotChanged(props),
    html,
    text,
    headers: unsubscribeHeaders(opts.unsubscribePostUrl),
  });
}
