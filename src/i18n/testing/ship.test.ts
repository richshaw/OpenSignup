import { beforeEach, describe, expect, it } from 'vitest';
import { isShipped, SHIPPED } from '../config';
import { ship } from './ship';
import { OTHER_LOCALE } from './locales';

// The tests in a file run in order, so each "back as it was" test checks what
// the one before it left behind.
const asShippedToday = structuredClone(SHIPPED);

describe('ship', () => {
  it('ships a language to one audience for the test', () => {
    ship('participant', ['en', OTHER_LOCALE]);
    expect(SHIPPED.participant).toEqual(['en', OTHER_LOCALE]);
    expect(isShipped('participant', OTHER_LOCALE)).toBe(true);
    expect(isShipped('organizer', OTHER_LOCALE)).toBe(false);
  });

  it('leaves SHIPPED as it was once that test has finished', () => {
    expect(SHIPPED).toEqual(asShippedToday);
  });

  it.fails('ships for a test that then fails', () => {
    ship('organizer', ['en', OTHER_LOCALE]);
    ship('participant', ['en', OTHER_LOCALE]);
    throw new Error('the test fails after shipping');
  });

  it('leaves SHIPPED as it was after a test that failed', () => {
    expect(SHIPPED).toEqual(asShippedToday);
  });

  describe('called in a beforeEach', () => {
    beforeEach(() => ship('site', ['en', OTHER_LOCALE]));

    it('ships for each test in the block', () => {
      expect(SHIPPED.site).toEqual(['en', OTHER_LOCALE]);
    });
  });

  it('leaves SHIPPED as it was after a block that shipped in its beforeEach', () => {
    expect(SHIPPED).toEqual(asShippedToday);
  });
});
