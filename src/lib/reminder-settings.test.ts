import { describe, expect, it } from 'vitest';
import { resolveReminderSettings } from './reminder-settings';

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
