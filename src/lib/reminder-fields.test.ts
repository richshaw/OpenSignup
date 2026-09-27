import { describe, expect, it } from 'vitest';
import { pickAnchorRef, resolveAnchorRef } from './reminder-fields';

const date = (ref: string, sortOrder: number) => ({ ref, fieldType: 'date' as const, sortOrder });
const text = (ref: string, sortOrder: number) => ({ ref, fieldType: 'text' as const, sortOrder });

describe('pickAnchorRef', () => {
  it('returns null when there is no date field', () => {
    expect(pickAnchorRef([text('what', 0)])).toBeNull();
    expect(pickAnchorRef([])).toBeNull();
  });

  it('picks the first date field by sortOrder, whatever order the caller passed', () => {
    expect(pickAnchorRef([date('return', 2), text('what', 0), date('depart', 1)])).toBe('depart');
  });

  it('breaks a sortOrder tie by ref, in code-point order', () => {
    // Matches migration 0005's COLLATE "C" tiebreak exactly.
    expect(pickAnchorRef([date('b-day', 1), date('a-day', 1)])).toBe('a-day');
    expect(pickAnchorRef([date('ab', 1), date('a-b', 1)])).toBe('a-b');
  });
});

describe('resolveAnchorRef', () => {
  const fields = [text('what', 0), date('depart', 1), date('return', 2)];

  it('keeps a ref that still names a date field, even when it is not the first', () => {
    expect(resolveAnchorRef({ reminderFromFieldRef: 'return' }, fields)).toBe('return');
  });

  it('moves to the first date field when the ref names nothing', () => {
    expect(resolveAnchorRef({ reminderFromFieldRef: 'gone' }, fields)).toBe('depart');
    expect(resolveAnchorRef({}, fields)).toBe('depart');
  });

  it('moves when the ref names a field that is no longer a date', () => {
    expect(resolveAnchorRef({ reminderFromFieldRef: 'what' }, fields)).toBe('depart');
  });

  it('resolves to null once no date field is left', () => {
    expect(resolveAnchorRef({ reminderFromFieldRef: 'depart' }, [text('what', 0)])).toBeNull();
  });
});
