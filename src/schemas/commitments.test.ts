import { describe, expect, it } from 'vitest';
import { CommitmentCreateInputSchema, CommitmentUpdateInputSchema } from './commitments';

describe('CommitmentCreateInputSchema email', () => {
  const base = { name: 'Pat Example' };

  it.each([
    ['missing', {}],
    ['null', { email: null }],
    ['empty', { email: '' }],
    ['only spaces', { email: '   ' }],
  ])('reads a %s email as no email', (_label, extra) => {
    const r = CommitmentCreateInputSchema.safeParse({ ...base, ...extra });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.email).toBeUndefined();
  });

  it('trims a valid email and keeps its casing', () => {
    const r = CommitmentCreateInputSchema.parse({ ...base, email: '  Pat@Example.com ' });
    expect(r.email).toBe('Pat@Example.com');
  });

  it('refuses an email that is not one, on the email field', () => {
    const r = CommitmentCreateInputSchema.safeParse({ ...base, email: 'not-an-email' });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues[0]?.path).toEqual(['email']);
  });

  it('refuses an email over 254 characters', () => {
    const r = CommitmentCreateInputSchema.safeParse({
      ...base,
      email: `${'a'.repeat(250)}@x.test`,
    });
    expect(r.success).toBe(false);
  });

  it('refuses an email that is not a string', () => {
    expect(CommitmentCreateInputSchema.safeParse({ ...base, email: 5 }).success).toBe(false);
  });
});

describe('CommitmentCreateInputSchema idempotencyKey', () => {
  const base = { name: 'Pat Example' };

  it('takes a key of 16 to 128 URL-safe characters, and none', () => {
    for (const key of ['a'.repeat(16), 'Ab0_-'.repeat(25) + 'xyz', undefined]) {
      const r = CommitmentCreateInputSchema.safeParse({ ...base, idempotencyKey: key });
      expect(r.success, String(key)).toBe(true);
    }
  });

  it.each([
    ['too short to be unguessable', 'a'.repeat(15)],
    ['too long', 'a'.repeat(129)],
    ['with other characters', `${'a'.repeat(16)} =`],
    ['blank', ''],
  ])('refuses a key %s, on its own field', (_label, key) => {
    const r = CommitmentCreateInputSchema.safeParse({ ...base, idempotencyKey: key });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues[0]?.path).toEqual(['idempotencyKey']);
  });
});

describe('Commitment names', () => {
  it('refuses a name of only spaces on sign-up and on edit, on the name field', () => {
    const created = CommitmentCreateInputSchema.safeParse({ name: '   ' });
    const updated = CommitmentUpdateInputSchema.safeParse({ name: '   ' });
    for (const r of [created, updated]) {
      expect(r.success).toBe(false);
      if (r.success) continue;
      expect(r.error.issues[0]?.path).toEqual(['name']);
    }
  });
});
