import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { SeedData } from './seed';

/** Reads the data written by global-setup's seed run. */
export function loadSeed(): SeedData {
  const file = path.join(process.cwd(), 'tests', 'e2e', '.seed.json');
  return JSON.parse(readFileSync(file, 'utf8')) as SeedData;
}

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
