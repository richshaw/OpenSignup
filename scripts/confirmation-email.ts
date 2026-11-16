/**
 * Prints, as one line of JSON, the confirmation email the app sends for a
 * sign-up:
 *
 *   pnpm exec tsx --tsconfig tsconfig.worker.json scripts/confirmation-email.ts <commitment id> <edit token>
 *
 * It builds the email from the sign-up's row as the web process does
 * (`confirmationFor`, which `notifyCommitmentCreated` sends) and hands it to
 * the app's email transport, with the transport's `send` swapped for one that
 * prints the message instead of sending it. The server's console transport
 * only writes an email to the server's log, so the e2e specs read a sign-up's
 * email this way (tests/e2e/helpers/confirmation-email.ts). Run it with the
 * server's environment, `E2E_UNSHIPPED_LOCALES` included, so it picks the
 * language the server did.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { getDb } from '@/db/client';
import { getEmailTransport } from '@/email';
import { loadCommitmentRow } from '@/email/commitment-row';
import { confirmationFor } from '@/email/notify';
import { sendCommitmentConfirmation } from '@/email/send';
import { EMAIL_LINE } from './lib/confirmation-email-line';

async function main(): Promise<void> {
  const [commitmentId, editToken] = process.argv.slice(2);
  if (!commitmentId || !editToken) {
    throw new Error('Usage: confirmation-email.ts <commitment id> <edit token>');
  }
  const db = getDb();
  const row = await loadCommitmentRow(db, commitmentId);
  if (!row?.participant.email) throw new Error(`No sign-up with an email: ${commitmentId}`);
  const transport = getEmailTransport();
  transport.send = async (message) => {
    process.stdout.write(`\n${EMAIL_LINE}${JSON.stringify(message)}\n`);
    return { id: 'printed', transport: 'console' };
  };
  await sendCommitmentConfirmation(
    row.participant.email,
    await confirmationFor(db, row, editToken),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => globalThis.__signup_pg__?.end({ timeout: 5 }));
