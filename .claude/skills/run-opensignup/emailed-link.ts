// Prints the link the latest sign-in email for <email> carries, for a local run.
//
// The console email transport logs URLs with their query string stripped, so the
// link cannot be read from the server log. The login code issued with the email
// stores the same Auth.js callback URL (encrypted), which is enough to rebuild it.
//
// Usage, from the repo root: pnpm exec tsx .claude/skills/run-opensignup/emailed-link.ts <email>
// The output carries a live sign-in token: use it, don't paste it anywhere.
import { config } from 'dotenv';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { decryptCallbackUrl } from '@/auth/login-code';
import { buildConfirmationUrl } from '@/auth/magic-link-url';
import { getDb } from '@/db/client';
import { magicLinks } from '@/db/schema/magic-links';
import { getEnv } from '@/lib/env';

config({ path: '.env.local' });

async function main(): Promise<number> {
  const email = (process.argv[2] ?? '').trim().toLowerCase();
  if (!email) {
    console.error('usage: emailed-link.ts <email>');
    return 2;
  }
  const [row] = await getDb()
    .select()
    .from(magicLinks)
    .where(
      and(
        eq(magicLinks.email, email),
        eq(magicLinks.purpose, 'login_code'),
        isNull(magicLinks.consumedAt),
      ),
    )
    .orderBy(desc(magicLinks.createdAt))
    .limit(1);
  const authCallback = row?.payloadEncrypted ? decryptCallbackUrl(row.payloadEncrypted) : null;
  if (!authCallback) {
    console.error(`no unused sign-in email for ${email}: press "Send magic link" first`);
    return 1;
  }
  console.log(buildConfirmationUrl(authCallback, getEnv().AUTH_URL));
  return 0;
}

main()
  .then(async (code) => {
    await globalThis.__signup_pg__?.end({ timeout: 5 });
    process.exit(code);
  })
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
