/**
 * Subject lines for participant email, shared with the templates so the
 * subject and the in-body preview text can never drift apart.
 *
 * The signup title comes first because that is what identifies the email in a
 * crowded inbox; the slot summary follows so two confirmations from the same
 * signup are still tellable apart. Clients truncate from the right, which
 * costs the detail rather than the identity.
 */

function withSummary(prefix: string, signupTitle: string, slotSummary: string): string {
  const head = `${prefix}: ${signupTitle}`;
  return slotSummary ? `${head} · ${slotSummary}` : head;
}

export function confirmationSubject(signupTitle: string, slotSummary: string): string {
  return withSummary("You're signed up", signupTitle, slotSummary);
}

export function reminderSubject(signupTitle: string, slotSummary: string): string {
  return withSummary('Reminder', signupTitle, slotSummary);
}
