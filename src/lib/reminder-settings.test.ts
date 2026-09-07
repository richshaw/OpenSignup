import { describe, expect, it } from 'vitest';
import { resolveSendReminders } from './reminder-settings';

describe('resolveSendReminders', () => {
  it('takes the submitted value when the form carried the control', () => {
    expect(
      resolveSendReminders(
        { sendRemindersPresent: true, sendRemindersChecked: true },
        { sendReminders: false },
      ),
    ).toBe(true);
  });

  it('turns reminders off when the checkbox was deliberately unticked', () => {
    // Marker present, checkbox absent — that is a real "off".
    expect(
      resolveSendReminders(
        { sendRemindersPresent: true, sendRemindersChecked: false },
        { sendReminders: true },
      ),
    ).toBe(false);
  });

  it('does not turn reminders off when the form never carried the control', () => {
    // A stale cached form, rendered before the checkbox existed. Silently
    // disabling every reminder for the signup would be the worst outcome here.
    expect(
      resolveSendReminders(
        { sendRemindersPresent: false, sendRemindersChecked: false },
        { sendReminders: true },
      ),
    ).toBe(true);
  });

  it('keeps an explicit off when the control is absent', () => {
    expect(
      resolveSendReminders(
        { sendRemindersPresent: false, sendRemindersChecked: false },
        { sendReminders: false },
      ),
    ).toBe(false);
  });

  it('defaults to on when nothing is saved and nothing submitted', () => {
    expect(
      resolveSendReminders({ sendRemindersPresent: false, sendRemindersChecked: false }, {}),
    ).toBe(true);
  });
});
