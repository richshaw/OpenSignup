import { describe, expect, it } from 'vitest';
import { REMINDER_SETTLE_HOURS, willSendReminder } from './reminder-eligibility';

const createdAt = new Date('2026-09-05T09:00:00.000Z');
const hoursOut = (h: number) => new Date(createdAt.getTime() + h * 3_600_000);

describe('willSendReminder', () => {
  it('is true for a dated slot comfortably ahead', () => {
    expect(willSendReminder({ sendReminders: true, slotAt: hoursOut(20), createdAt })).toBe(true);
  });

  it('is false when the signup has reminders switched off', () => {
    expect(willSendReminder({ sendReminders: false, slotAt: hoursOut(20), createdAt })).toBe(false);
  });

  it('is false for a slot with no date to count back from', () => {
    expect(willSendReminder({ sendReminders: true, slotAt: null, createdAt })).toBe(false);
    expect(willSendReminder({ sendReminders: true, slotAt: undefined, createdAt })).toBe(false);
  });

  it('is false for a slot sooner than the settle window', () => {
    // Sign up at 09:00 for a 09:40 slot: the dispatcher's created_at guard means
    // no scan can ever select this, so the receipt must not promise a reminder.
    expect(willSendReminder({ sendReminders: true, slotAt: hoursOut(0.66), createdAt })).toBe(
      false,
    );
  });

  it('is false for a slot in the past', () => {
    expect(willSendReminder({ sendReminders: true, slotAt: hoursOut(-2), createdAt })).toBe(false);
  });

  it('turns over exactly at the settle window', () => {
    expect(
      willSendReminder({ sendReminders: true, slotAt: hoursOut(REMINDER_SETTLE_HOURS), createdAt }),
    ).toBe(false);
    expect(
      willSendReminder({
        sendReminders: true,
        slotAt: new Date(hoursOut(REMINDER_SETTLE_HOURS).getTime() + 1),
        createdAt,
      }),
    ).toBe(true);
  });

  it('defaults createdAt to now', () => {
    expect(
      willSendReminder({ sendReminders: true, slotAt: new Date(Date.now() + 20 * 3_600_000) }),
    ).toBe(true);
    expect(willSendReminder({ sendReminders: true, slotAt: new Date(Date.now() + 60_000) })).toBe(
      false,
    );
  });
});
