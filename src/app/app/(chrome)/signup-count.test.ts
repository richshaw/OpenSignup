import { describe, expect, it } from 'vitest';
import { WORKSPACE_LIST_LIMIT } from '@/schemas/signups';
import { signupCountLabel } from './signup-count';

describe('signupCountLabel', () => {
  it('says "N total" when every signup is listed', () => {
    expect(signupCountLabel(1, 1)).toBe('1 total');
    expect(signupCountLabel(12, 12)).toBe('12 total');
    expect(signupCountLabel(WORKSPACE_LIST_LIMIT, WORKSPACE_LIST_LIMIT)).toBe(
      `${WORKSPACE_LIST_LIMIT} total`,
    );
  });

  it('says how many of the total are shown when the list stops short', () => {
    expect(signupCountLabel(WORKSPACE_LIST_LIMIT, WORKSPACE_LIST_LIMIT + 1)).toBe(
      `Showing the newest ${WORKSPACE_LIST_LIMIT} of ${WORKSPACE_LIST_LIMIT + 1}`,
    );
    expect(signupCountLabel(WORKSPACE_LIST_LIMIT, 1234)).toBe(
      `Showing the newest ${WORKSPACE_LIST_LIMIT} of 1234`,
    );
  });

  it('never claims fewer signups than are on the page', () => {
    // A signup created between the list and the count queries: trust the rows.
    expect(signupCountLabel(5, 4)).toBe('5 total');
  });
});
