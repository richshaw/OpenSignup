import { describe, expect, it } from 'vitest';
import { makeId } from '@/lib/ids';
import { MAX_JSON_BODY_BYTES } from '@/lib/request-body';
import {
  MAX_REORDER_IDS,
  SlotBulkInputSchema,
  SlotCapacitySchema,
  SlotCreateInputSchema,
  SlotReorderInputSchema,
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

describe('SlotReorderInputSchema', () => {
  it('takes more ids than fit in a body, so no real reorder meets its cap', () => {
    const shortest = makeId('fld');
    const bodyBytes = JSON.stringify({
      fieldIds: Array(MAX_REORDER_IDS + 1).fill(shortest),
    }).length;
    expect(bodyBytes).toBeGreaterThan(MAX_JSON_BODY_BYTES);
  });

  it('refuses a body-sized array of wrong items with a single issue', () => {
    const result = SlotReorderInputSchema.safeParse({
      slotIds: Array(MAX_REORDER_IDS + 1).fill(0),
    });
    expect(result.error?.issues).toHaveLength(1);
    expect(result.error?.issues[0]).toMatchObject({ code: 'too_big', path: ['slotIds'] });
  });
});
