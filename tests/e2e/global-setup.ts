import { config } from 'dotenv';
import { seedE2E } from './helpers/seed';

export default async function globalSetup(): Promise<void> {
  // Env first: getEnv() is lazy everywhere, so loading here (before any
  // seed code runs) is early enough.
  config({ path: '.env.local' });
  config({ path: '.env' });
  await seedE2E();
  // Close the singleton postgres pool so the setup process can exit cleanly.
  await globalThis.__signup_pg__?.end({ timeout: 5 });
}
