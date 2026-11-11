import { describe, expect, it } from 'vitest';
import { shownCommitmentStatus } from './commitments';

type Ending = 'removed' | 'moved' | undefined;

// Every status crossed with every way `howCommitmentsEnded` can describe it.
// Only a cancelled one takes the organizer's word for how it ended.
const CASES: [status: string, how: Ending, shown: string][] = [
  ['confirmed', undefined, 'confirmed'],
  ['confirmed', 'removed', 'confirmed'],
  ['confirmed', 'moved', 'confirmed'],
  ['tentative', undefined, 'tentative'],
  ['tentative', 'removed', 'tentative'],
  ['tentative', 'moved', 'tentative'],
  ['waitlist', undefined, 'waitlist'],
  ['waitlist', 'removed', 'waitlist'],
  ['waitlist', 'moved', 'waitlist'],
  ['cancelled', undefined, 'cancelled'],
  ['cancelled', 'removed', 'removed'],
  ['cancelled', 'moved', 'moved'],
  ['no_show', undefined, 'no_show'],
  ['no_show', 'removed', 'no_show'],
  ['no_show', 'moved', 'no_show'],
];

describe('shownCommitmentStatus', () => {
  it.each(CASES)('shows %s ended %s as %s', (status, how, shown) => {
    const ended = new Map<string, 'removed' | 'moved'>();
    if (how) ended.set('com_1', how);
    expect(shownCommitmentStatus({ id: 'com_1', status }, ended)).toBe(shown);
  });

  it('goes by the commitment id, not by any entry in the map', () => {
    const ended = new Map<string, 'removed' | 'moved'>([['com_other', 'removed']]);
    expect(shownCommitmentStatus({ id: 'com_1', status: 'cancelled' }, ended)).toBe('cancelled');
  });
});
