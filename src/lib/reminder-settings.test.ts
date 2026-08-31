import { describe, expect, it } from 'vitest';
import { REMINDER_LEAD_HOUR_CHOICES } from '@/schemas/signups';
import { leadHourLabel, leadHourOptions, resolveReminderSettings } from './reminder-settings';

const saved = { sendReminders: true, reminderLeadHours: 72 };

describe('resolveReminderSettings', () => {
  it('takes the submitted values when the form carried them', () => {
    expect(
      resolveReminderSettings(
        { sendRemindersPresent: true, sendRemindersChecked: true, leadHoursRaw: '24' },
        saved,
      ),
    ).toEqual({ sendReminders: true, reminderLeadHours: 24 });
  });

  it('turns reminders off when the checkbox was deliberately unticked', () => {
    // Marker present, checkbox absent — that is a real "off".
    expect(
      resolveReminderSettings(
        { sendRemindersPresent: true, sendRemindersChecked: false, leadHoursRaw: '24' },
        saved,
      ).sendReminders,
    ).toBe(false);
  });

  it('does not turn reminders off when the form never carried the control', () => {
    // A stale cached form, rendered before the checkbox existed. Silently
    // disabling every reminder for the signup would be the worst outcome here.
    expect(
      resolveReminderSettings(
        { sendRemindersPresent: false, sendRemindersChecked: false, leadHoursRaw: '24' },
        saved,
      ).sendReminders,
    ).toBe(true);
  });

  it('keeps an explicit off when the control is absent', () => {
    expect(
      resolveReminderSettings(
        { sendRemindersPresent: false, sendRemindersChecked: false, leadHoursRaw: null },
        { sendReminders: false, reminderLeadHours: 24 },
      ).sendReminders,
    ).toBe(false);
  });

  it('keeps the saved lead time when the field is absent', () => {
    expect(
      resolveReminderSettings(
        { sendRemindersPresent: true, sendRemindersChecked: true, leadHoursRaw: null },
        saved,
      ).reminderLeadHours,
    ).toBe(72);
  });

  it('ignores a lead time that is not one of the offered choices', () => {
    for (const bogus of ['0', '999', 'abc', '']) {
      expect(
        resolveReminderSettings(
          { sendRemindersPresent: true, sendRemindersChecked: true, leadHoursRaw: bogus },
          saved,
        ).reminderLeadHours,
      ).toBe(72);
    }
  });

  it('falls back to the defaults when nothing is saved and nothing submitted', () => {
    expect(
      resolveReminderSettings(
        { sendRemindersPresent: false, sendRemindersChecked: false, leadHoursRaw: null },
        {},
      ),
    ).toEqual({ sendReminders: true, reminderLeadHours: 24 });
  });
});

describe('leadHourOptions', () => {
  it('offers the standard choices when the saved value is one of them', () => {
    expect(leadHourOptions(24)).toEqual([...REMINDER_LEAD_HOUR_CHOICES]);
  });

  it('includes a saved value the standard choices do not cover', () => {
    // The API accepts 1–168, so 12 is legitimately storable. Left out of the
    // list, no option matches and the next Save rewrites it to the first one.
    expect(leadHourOptions(12)).toEqual([2, 12, 24, 48, 72]);
  });

  it('keeps the list sorted and free of duplicates', () => {
    expect(leadHourOptions(168)).toEqual([2, 24, 48, 72, 168]);
    expect(leadHourOptions(2)).toEqual([2, 24, 48, 72]);
  });
});

describe('leadHourLabel', () => {
  it('labels whole days as days', () => {
    expect(leadHourLabel(24)).toBe('1 day before');
    expect(leadHourLabel(48)).toBe('2 days before');
    expect(leadHourLabel(168)).toBe('7 days before');
  });

  it('labels sub-day and non-multiple values as hours', () => {
    expect(leadHourLabel(1)).toBe('1 hour before');
    expect(leadHourLabel(2)).toBe('2 hours before');
    expect(leadHourLabel(36)).toBe('36 hours before');
  });
});
