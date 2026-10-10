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
  // One for each `CancelledSlotState`: the reason the slot would refuse them.
  it.each([
    ['open', 'There’s still room if you want to sign up again.'],
    ['full', 'The slot has filled up since.'],
    ['slotClosed', 'The slot has closed.'],
    ['signupClosed', 'The signup has closed.'],
  ] as const)('says why for a slot that is %s', (state, body) => {
    expect(CANCELLED_PAGE[state]).toEqual({ title: 'Your spot was cancelled', body });
  });

  // One person's place is a "spot", as in the help pages. "Sign-up" beside
  // "the signup" (the page) read as one word spelt two ways.
  it.each(Object.entries(CANCELLED_PAGE))('%s never calls it a sign-up', (_, copy) => {
    expect(`${copy.title} ${copy.body}`).not.toMatch(/sign-ups?\b/i);
  });

  // Anywhere else, signing up again would be refused.
  it('suggests signing up again only while the slot takes places', () => {
    const suggesting = Object.entries(CANCELLED_PAGE)
      .filter(([, copy]) => /sign up again/i.test(copy.body))
      .map(([state]) => state);
    expect(suggesting).toEqual(['open']);
  });

  // The participant knows when they cancelled or moved, so only an
  // organizer's removal names who did it.
  it.each(Object.entries(CANCELLED_PAGE).filter(([state]) => state !== 'removed'))(
    '%s does not say who cancelled',
    (_, copy) => {
      expect(`${copy.title} ${copy.body}`).not.toMatch(/you cancelled|organizer|removed/i);
    },
  );

  it('says the organizer took them off, and does not invite them back', () => {
    expect(CANCELLED_PAGE.removed).toEqual({
      title: 'The organizer took you off this slot',
      body: 'If you think this is a mistake, contact the organizer.',
    });
  });
});
