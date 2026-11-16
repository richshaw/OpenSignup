/**
 * What starts the line scripts/confirmation-email.ts prints a confirmation
 * email on, so a log line beside it isn't read as the email. The e2e helper
 * that reads it (tests/e2e/helpers/confirmation-email.ts) imports it from
 * here, so the two can't disagree.
 */
export const EMAIL_LINE = 'confirmation-email ';
