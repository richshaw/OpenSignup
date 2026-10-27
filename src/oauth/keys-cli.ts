/**
 * Rotate the OAuth access-token signing key.
 *
 * Usage:
 *   pnpm oauth:keys rotate        # add a new signing key, list the active ones
 *   pnpm oauth:keys retire <kid>  # stop trusting an old key
 *   pnpm oauth:keys retire --force <kid>  # now, for a key that leaked
 *
 * After `rotate`, restart every web instance: the provider signs with the
 * newest key only once it restarts. Tokens the old key signed stay valid
 * until they expire, so `retire` refuses an old key until a newer one has
 * been signing for `RETIRE_AFTER_SECONDS`, unless `--force` is given. A
 * retired key stops being
 * trusted once each instance re-reads its keys, within
 * `SIGNING_KEY_CACHE_MAX_AGE`, with no restart. Lives under `src/` rather
 * than `scripts/` so the production image, which ships `src` and `tsx`, can
 * run it.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { getDb } from '@/db/client';
import { SIGNING_KEY_CACHE_MAX_AGE } from './config';
import {
  RETIRE_AFTER_SECONDS,
  keyErrorSummary,
  listSigningKeys,
  retireSigningKey,
  rotateSigningKey,
} from './keys';

const WAIT_MINUTES = Math.ceil(RETIRE_AFTER_SECONDS / 60);

async function printActiveKeys(): Promise<void> {
  console.log('Active signing keys, newest first:');
  for (const key of await listSigningKeys(getDb())) {
    const signing = key.signingSince
      ? `signing since ${key.signingSince.toISOString()}`
      : 'not signed with yet (restart the web instances)';
    console.log(`  ${key.kid}  created ${key.createdAt.toISOString()}, ${signing}`);
  }
}

async function main(command: string | undefined, args: string[]): Promise<void> {
  const force = command === 'retire' && args[0] === '--force';
  const [kid, ...rest] = force ? args.slice(1) : args;
  if (command === 'rotate' && !kid) {
    const newKid = await rotateSigningKey(getDb());
    console.log(`Added signing key ${newKid}.\n`);
    await printActiveKeys();
    console.log(
      `\nRestart every web instance so it signs with the new key. Then wait ${WAIT_MINUTES} minutes,\n` +
        'so every token an older key signed has expired, and retire each older key with\n' +
        '`pnpm oauth:keys retire <kid>`.',
    );
  } else if (command === 'retire' && kid && rest.length === 0) {
    const outcome = await retireSigningKey(getDb(), kid, { force });
    if (outcome === 'unknown') {
      console.error(`${kid} is not an active signing key.\n`);
      await printActiveKeys();
      process.exit(1);
    }
    if (outcome === 'in_use' && force) {
      console.error(
        `${kid} is the newest signing key. Run \`pnpm oauth:keys rotate\` and restart every web\n` +
          'instance first, so there is a key left to sign with.\n',
      );
      await printActiveKeys();
      process.exit(1);
    }
    if (outcome === 'in_use') {
      console.error(
        `${kid} may still be signing tokens, or a token it signed may still be live.\n` +
          `Retire it once a newer key has been signing for ${WAIT_MINUTES} minutes: run\n` +
          '`pnpm oauth:keys rotate` if there is no newer key, restart every web instance, and wait.\n' +
          'If the key leaked, add --force to retire it now: tokens it signed stop working, and\n' +
          'connected assistants get a new one on their next refresh.\n',
      );
      await printActiveKeys();
      process.exit(1);
    }
    console.log(
      `Retired ${kid}${force ? ' without waiting' : ''}. Running instances stop trusting it within ` +
        `${SIGNING_KEY_CACHE_MAX_AGE / 60} minutes, with no restart.\n` +
        (force ? 'An instance that still signs with it issues tokens that fail until it restarts.\n' : ''),
    );
    await printActiveKeys();
  } else {
    console.error('Usage: pnpm oauth:keys rotate | pnpm oauth:keys retire [--force] <kid>');
    process.exit(1);
  }
}

const [command, ...args] = process.argv.slice(2);
main(command, args)
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    // Not `err` itself: a failed insert's message carries the new private key.
    console.error(`pnpm oauth:keys ${command ?? ''} failed: ${keyErrorSummary(err)}`);
    process.exit(1);
  });
