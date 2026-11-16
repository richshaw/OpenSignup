import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect } from '@playwright/test';
import { getDb } from '@/db/client';
import { alreadyRecorded, loadCommitmentRow } from '@/email/commitment-row';
import type { EmailMessage } from '@/email/transport';
import { UNSHIPPED_LOCALES } from './unshipped-locales';

/** What starts the line scripts/confirmation-email.ts prints the email on. */
const EMAIL_LINE = 'confirmation-email ';

/**
 * The confirmation email the participant of `commitmentId` got, as the app's
 * email transport receives it. The server's transport (the console one, in
 * development and CI) only writes it to the server's log, which a spec can't
 * read. So this waits until the server has recorded sending it
 * (`commitment.confirmation_sent`), then runs scripts/confirmation-email.ts,
 * which builds the same email from the same row, through the same code and
 * with the server's `E2E_UNSHIPPED_LOCALES`, and prints what reaches the
 * transport. A process of its own, since Playwright's JSX transform can't
 * render React Email. `editToken` is the one the sign-up's response gave.
 */
export async function sentConfirmation(
  commitmentId: string,
  editToken: string,
): Promise<EmailMessage> {
  const db = getDb();
  const row = await loadCommitmentRow(db, commitmentId);
  if (!row) throw new Error(`no sign-up ${commitmentId}`);
  await expect
    .poll(() => alreadyRecorded(db, 'commitment.confirmation_sent', row.signup.id, commitmentId), {
      message: 'the server sent no confirmation email',
    })
    .toBe(true);

  const { stdout } = await promisify(execFile)(
    'pnpm',
    [
      'exec',
      'tsx',
      '--tsconfig',
      'tsconfig.worker.json',
      'scripts/confirmation-email.ts',
      commitmentId,
      editToken,
    ],
    { env: { ...process.env, E2E_UNSHIPPED_LOCALES: UNSHIPPED_LOCALES } },
  );
  const line = stdout.split('\n').find((text) => text.startsWith(EMAIL_LINE));
  if (!line) throw new Error(`scripts/confirmation-email.ts printed no email:\n${stdout}`);
  return JSON.parse(line.slice(EMAIL_LINE.length)) as EmailMessage;
}
