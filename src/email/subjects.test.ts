import { describe, expect, it } from 'vitest';
import { confirmationSubject, reminderSubject } from './subjects';

describe('email subjects', () => {
  it('leads with the signup title, then the slot values', () => {
    expect(confirmationSubject('Spring Book Fair Volunteers', 'Wed, Sep 9 · 13:00')).toBe(
      "You're signed up: Spring Book Fair Volunteers · Wed, Sep 9 · 13:00",
    );
    expect(reminderSubject('Spring Book Fair Volunteers', 'Wed, Sep 9 · 13:00')).toBe(
      'Reminder: Spring Book Fair Volunteers · Wed, Sep 9 · 13:00',
    );
  });

  it('omits the separator when the slot has nothing to summarise', () => {
    expect(confirmationSubject('Bake Sale', '')).toBe("You're signed up: Bake Sale");
    expect(reminderSubject('Bake Sale', '')).toBe('Reminder: Bake Sale');
  });
});
