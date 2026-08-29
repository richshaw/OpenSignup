import { describe, expect, it } from 'vitest';
import { formatSlotWhen } from './slot-time';

describe('formatSlotWhen', () => {
  it('renders a dated slot with its time', () => {
    expect(formatSlotWhen(new Date('2026-09-05T18:30:00.000Z'))).toBe(
      'Saturday, September 5 at 6:30 PM',
    );
  });

  it('drops the time for a date-only slot rather than showing 12:00 AM', () => {
    expect(formatSlotWhen(new Date('2026-09-05T00:00:00.000Z'))).toBe('Saturday, September 5');
  });

  it('reads the instant back in UTC regardless of the host timezone', () => {
    // slot_at is the organizer's wall clock pinned to UTC. A worker running in
    // a negative-offset zone must not report this slot as the 5th.
    const original = process.env.TZ;
    try {
      process.env.TZ = 'America/Los_Angeles';
      expect(formatSlotWhen(new Date('2026-09-06T02:00:00.000Z'))).toBe(
        'Sunday, September 6 at 2:00 AM',
      );
    } finally {
      process.env.TZ = original;
    }
  });

  it('returns null for a missing or invalid instant', () => {
    expect(formatSlotWhen(null)).toBeNull();
    expect(formatSlotWhen(undefined)).toBeNull();
    expect(formatSlotWhen(new Date('nonsense'))).toBeNull();
  });
});
