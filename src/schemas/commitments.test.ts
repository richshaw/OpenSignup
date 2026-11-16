import { describe, expect, it } from 'vitest';
import { fromZodError, type ErrorReason } from '@/lib/errors';
import { parseInputSafe } from '@/lib/parse';
import { NAME_MAX_LENGTH, NOTES_MAX_LENGTH, QUANTITY_MAX } from '@/lib/participant-limits';
import {
  COMMITMENT_INPUT_REASONS,
  CommitmentCreateInputSchema,
  CommitmentUpdateInputSchema,
} from './commitments';

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

describe('COMMITMENT_INPUT_REASONS', () => {
  const base = { name: 'Pat Example' };
  const schemas = [
    ['signing up', CommitmentCreateInputSchema],
    ['the edit link', CommitmentUpdateInputSchema],
  ] as const;

  /** The error a refused input gets, as the commitments service builds it. */
  function refusal(schema: (typeof schemas)[number][1], input: unknown) {
    const r = parseInputSafe(schema, input, COMMITMENT_INPUT_REASONS);
    if (r.ok) throw new Error(`expected ${JSON.stringify(input)} to be refused`);
    return r.error;
  }

  // Each check a person can fail by what they type, by field and Zod issue code.
  const CASES: [
    label: string,
    input: Record<string, unknown>,
    field: string,
    reason: ErrorReason,
  ][] = [
    ['a name of only spaces (too_small)', { name: '   ' }, 'name', 'name_required'],
    ['an empty name (too_small)', { name: '' }, 'name', 'name_required'],
    [
      'a name too long (too_big)',
      { name: 'x'.repeat(NAME_MAX_LENGTH + 1) },
      'name',
      'name_too_long',
    ],
    [
      'notes too long (too_big)',
      { ...base, notes: 'n'.repeat(NOTES_MAX_LENGTH + 1) },
      'notes',
      'notes_too_long',
    ],
    ['no spots (too_small)', { ...base, quantity: 0 }, 'quantity', 'quantity_too_small'],
    ['fewer than none (too_small)', { ...base, quantity: -2 }, 'quantity', 'quantity_too_small'],
    [
      'too many spots (too_big)',
      { ...base, quantity: QUANTITY_MAX + 1 },
      'quantity',
      'quantity_too_large',
    ],
    ['part of a spot (invalid_type)', { ...base, quantity: 1.5 }, 'quantity', 'quantity_not_whole'],
    ['spots as text (invalid_type)', { ...base, quantity: '2' }, 'quantity', 'quantity_not_whole'],
  ];

  for (const [where, schema] of schemas) {
    it.each(CASES)(`names %s on ${where}`, (_label, input, field, reason) => {
      const error = refusal(schema, input);
      expect(error.field).toBe(field);
      expect(error.details).toEqual({ reason });
    });
  }

  // Only signing up takes an email; the edit link can't change it.
  it.each([
    ['not an address (invalid_string)', 'pat@localhost'],
    ['no @ (invalid_string)', 'pat.example.com'],
    ['longer than an address can be (too_big)', `${'a'.repeat(250)}@x.test`],
  ])('names an email %s on signing up', (_label, email) => {
    const error = refusal(CommitmentCreateInputSchema, { ...base, email });
    expect(error.field).toBe('email');
    expect(error.details).toEqual({ reason: 'email_invalid' });
  });

  // No reason: the pages word these from the code. None comes from typing
  // into the forms, which always send text and never send these fields.
  it.each([
    ['a missing name', CommitmentCreateInputSchema, {}],
    ['a name that is not text', CommitmentCreateInputSchema, { name: 5 }],
    ['an email that is not text', CommitmentCreateInputSchema, { ...base, email: 5 }],
    ['notes that are not text', CommitmentCreateInputSchema, { ...base, notes: 5 }],
    ['a short phone', CommitmentCreateInputSchema, { ...base, phone: '1' }],
    ['a bad idempotency key', CommitmentCreateInputSchema, { ...base, idempotencyKey: 'short' }],
    ['a bad slot to move to', CommitmentUpdateInputSchema, { swapToSlotId: 'slot_nope' }],
    ['a body that is not an object', CommitmentUpdateInputSchema, 'nope'],
  ])('gives no reason for %s', (_label, schema, input) => {
    expect(refusal(schema, input).details).toBeUndefined();
  });

  it("keeps Zod's message and the suggestion for API callers", () => {
    expect(refusal(CommitmentCreateInputSchema, { ...base, email: 'pat@localhost' })).toEqual({
      code: 'invalid_input',
      message: 'Invalid email',
      field: 'email',
      suggestion: 'Check the value of "email".',
      details: { reason: 'email_invalid' },
    });
    expect(refusal(CommitmentUpdateInputSchema, { quantity: QUANTITY_MAX + 1 })).toEqual({
      code: 'invalid_input',
      message: `Number must be less than or equal to ${QUANTITY_MAX}`,
      field: 'quantity',
      suggestion: 'Check the value of "quantity".',
      details: { reason: 'quantity_too_large' },
    });
    // Everything but the reason is what the error was without the table.
    const parsed = CommitmentCreateInputSchema.safeParse({ ...base, quantity: 1.5 });
    if (parsed.success) throw new Error('expected a parse failure');
    const { details: _reason, ...rest } = refusal(CommitmentCreateInputSchema, {
      ...base,
      quantity: 1.5,
    });
    expect(rest).toEqual(fromZodError(parsed.error));
    expect(rest).toMatchObject({ expected: 'integer', received: 'float' });
  });
});
