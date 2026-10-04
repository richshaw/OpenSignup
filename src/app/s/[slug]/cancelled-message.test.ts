import { describe, expect, it } from 'vitest';
import { CANCELLED_PAGE, wasCancelled } from './cancelled-message';

describe('wasCancelled', () => {
  it('is true for a conflict over a cancelled sign-up', () => {
    expect(wasCancelled({ code: 'conflict', details: { status: 'cancelled' } })).toBe(true);
  });

  // `conflict` alone is not enough: it also means the other end state, or
  // something else entirely.
  it('is false for any other conflict', () => {
    expect(wasCancelled({ code: 'conflict', details: { status: 'no_show' } })).toBe(false);
    expect(wasCancelled({ code: 'conflict', details: { commitmentId: 'com_1' } })).toBe(false);
    expect(wasCancelled({ code: 'conflict' })).toBe(false);
  });

  it('is false for every other error, and none', () => {
    expect(wasCancelled({ code: 'not_found', details: { status: 'cancelled' } })).toBe(false);
    expect(wasCancelled({ code: 'closed' })).toBe(false);
    expect(wasCancelled({ code: 'capacity_full' })).toBe(false);
    expect(wasCancelled({})).toBe(false);
    expect(wasCancelled(null)).toBe(false);
    expect(wasCancelled(undefined)).toBe(false);
  });
});

describe('CANCELLED_PAGE', () => {
  // An organizer may one day remove someone; the same words have to fit.
  it.each(Object.entries(CANCELLED_PAGE))('%s does not say who cancelled', (_, copy) => {
    expect(`${copy.title} ${copy.body}`).not.toMatch(/you cancelled|organizer|removed/i);
  });
});
