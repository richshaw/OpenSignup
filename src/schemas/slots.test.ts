import { describe, expect, it } from 'vitest';
import {
  SlotBulkInputSchema,
  SlotCapacitySchema,
  SlotCreateInputSchema,
  SlotUpdateInputSchema,
} from './slots';

describe('SlotCapacitySchema', () => {
  it('takes a whole number from 1, or null for no limit', () => {
    for (const ok of [1, 2, 500, null]) {
      expect(SlotCapacitySchema.safeParse(ok).success).toBe(true);
    }
  });

  it('refuses zero, negatives, fractions and anything not a number', () => {
    for (const bad of [0, -1, 1.5, '2', undefined]) {
      expect(SlotCapacitySchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('slot inputs keep their own capacity defaults', () => {
  it('a single create defaults to 1', () => {
    expect(SlotCreateInputSchema.parse({}).capacity).toBe(1);
  });

  it('a bulk row and an update leave an omitted capacity unset', () => {
    expect(SlotBulkInputSchema.parse({ rows: [{}] }).rows[0]?.capacity).toBeUndefined();
    expect(SlotUpdateInputSchema.parse({}).capacity).toBeUndefined();
  });

  it('every input refuses a capacity the shared rule refuses', () => {
    expect(SlotCreateInputSchema.safeParse({ capacity: 0 }).success).toBe(false);
    expect(SlotBulkInputSchema.safeParse({ rows: [{ capacity: 1.5 }] }).success).toBe(false);
    expect(SlotUpdateInputSchema.safeParse({ capacity: -2 }).success).toBe(false);
  });
});
