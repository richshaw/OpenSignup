import { uuidv7 } from 'uuidv7';

export const ID_PREFIXES = [
  'ws', // Workspace
  'org', // Organizer
  'mem', // WorkspaceMember
  'sig', // Signup
  'fld', // SlotField
  'slot', // Slot
  'par', // Participant
  'com', // Commitment
  'act', // Activity
  'ml', // MagicLink
  'cla', // SignupClaim
  'idm', // Idempotency record
  'rl', // Rate limit bucket
  'job', // pg-boss helper (our own, not pg-boss internal)
] as const;

export type IdPrefix = (typeof ID_PREFIXES)[number];

// ASCII-sorted so lexicographic comparison matches numeric order (required for UUIDv7 sortability).
const BASE62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE62 = 62n;

function toBase62(bigint: bigint, padTo: number): string {
  if (bigint < 0n) throw new Error('expected non-negative');
  let n = bigint;
  let out = '';
  while (n > 0n) {
    const rem = Number(n % BASE62);
    out = BASE62_ALPHABET[rem] + out;
    n = n / BASE62;
  }
  return out.padStart(padTo, '0');
}

function uuidToBigInt(uuid: string): bigint {
  return BigInt('0x' + uuid.replace(/-/g, ''));
}

export function makeId<P extends IdPrefix>(prefix: P): `${P}_${string}` {
  const uuid = uuidv7();
  const body = toBase62(uuidToBigInt(uuid), 22);
  return `${prefix}_${body}` as `${P}_${string}`;
}

function isBase62Body(body: string): boolean {
  if (body.length !== 22) return false;
  for (const c of body) {
    if (!BASE62_ALPHABET.includes(c)) return false;
  }
  return true;
}

export function parseId(value: string): { prefix: IdPrefix; body: string } | null {
  const idx = value.indexOf('_');
  if (idx < 0) return null;
  const prefix = value.slice(0, idx) as IdPrefix;
  if (!ID_PREFIXES.includes(prefix)) return null;
  const body = value.slice(idx + 1);
  if (!isBase62Body(body)) return null;
  return { prefix, body };
}

export function isId<P extends IdPrefix>(prefix: P, value: unknown): value is `${P}_${string}` {
  if (typeof value !== 'string') return false;
  const parsed = parseId(value);
  return parsed?.prefix === prefix;
}
