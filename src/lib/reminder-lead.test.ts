import { describe, expect, it } from 'vitest';
import { REMINDER_LEAD_HOURS, REMINDER_LEAD_WORDS } from './reminder-lead';

describe('REMINDER_LEAD_WORDS', () => {
  it('says "the day before" for a 24-hour lead', () => {
    expect(REMINDER_LEAD_HOURS).toBe(24);
    expect(REMINDER_LEAD_WORDS).toBe('the day before');
  });
});
