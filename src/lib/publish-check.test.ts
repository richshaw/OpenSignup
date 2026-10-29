import { describe, expect, it } from 'vitest';
import type { FieldType } from '@/schemas/slot-fields';
import {
  checkBeforePublish,
  publishCheckCopy,
  publishCheckTarget,
  type PublishCheck,
} from './publish-check';

function field(ref: string, fieldType: FieldType = 'text', label: string = ref) {
  return { ref, label, fieldType };
}

function slot(id: string, values: Record<string, unknown>) {
  return { id, values };
}

const what = field('what', 'text', 'What');
const date = field('date', 'date', 'Date');

describe('checkBeforePublish', () => {
  it('finds nothing wrong with slots that say what they are', () => {
    const input = {
      fields: [what, date],
      slots: [slot('s1', { what: 'Setup', date: '2026-11-14' }), slot('s2', { what: 'Cleanup' })],
    };
    expect(checkBeforePublish(input)).toBeNull();
  });

  describe('no_slots', () => {
    it('blocks a signup with no slots', () => {
      expect(checkBeforePublish({ fields: [what], slots: [] })).toEqual({ kind: 'no_slots' });
    });

    it('comes first, even when there are no fields either', () => {
      expect(checkBeforePublish({ fields: [], slots: [] })).toEqual({ kind: 'no_slots' });
    });
  });

  describe('no_fields', () => {
    it('blocks a signup whose slots have no fields to show', () => {
      expect(checkBeforePublish({ fields: [], slots: [slot('s1', {})] })).toEqual({
        kind: 'no_fields',
      });
    });

    it('comes before values held under a ref that is not a field', () => {
      expect(checkBeforePublish({ fields: [], slots: [slot('s1', { what: 'TBD' })] })).toEqual({
        kind: 'no_fields',
      });
    });
  });

  describe('all_blank', () => {
    it('blocks when every slot has no value in any field, pointing at the first', () => {
      const input = {
        fields: [what, date],
        slots: [
          slot('s1', {}),
          slot('s2', { what: '', date: null }),
          slot('s3', { what: undefined }),
        ],
      };
      expect(checkBeforePublish(input)).toEqual({ kind: 'all_blank', slotId: 's1', slotCount: 3 });
    });

    it('blocks the one empty slot a signup made by hand starts with', () => {
      expect(checkBeforePublish({ fields: [what, date], slots: [slot('s1', {})] })).toEqual({
        kind: 'all_blank',
        slotId: 's1',
        slotCount: 1,
      });
    });

    it('counts a value of only spaces as empty', () => {
      const input = {
        fields: [what],
        slots: [slot('s1', { what: '   ' }), slot('s2', { what: '\n\t' })],
      };
      expect(checkBeforePublish(input)).toEqual({ kind: 'all_blank', slotId: 's1', slotCount: 2 });
    });

    it('ignores values under refs that are not fields', () => {
      const input = { fields: [what], slots: [slot('s1', { gone: 'Setup' })] };
      expect(checkBeforePublish(input)).toEqual({ kind: 'all_blank', slotId: 's1', slotCount: 1 });
    });

    it('lets blank slots through when another slot has a value', () => {
      const input = { fields: [what], slots: [slot('s1', {}), slot('s2', { what: 'Setup' })] };
      expect(checkBeforePublish(input)).toBeNull();
    });

    it('counts 0 as a value', () => {
      const count = field('count', 'number');
      expect(checkBeforePublish({ fields: [count], slots: [slot('s1', { count: 0 })] })).toBeNull();
    });

    it('lets a date-only signup through, its slots differing only by date', () => {
      const input = {
        fields: [date],
        slots: [
          slot('s1', { date: '2026-11-12' }),
          slot('s2', { date: '2026-11-13' }),
          slot('s3', { date: '2026-11-14' }),
        ],
      };
      expect(checkBeforePublish(input)).toBeNull();
    });
  });

  it('lets slots that say TBD, TBC or TBA through: the organizer may mean it', () => {
    const input = {
      fields: [what, date],
      slots: [
        slot('s1', { what: 'TBD', date: '2026-11-14' }),
        slot('s2', { what: 'Cashier TBC' }),
        slot('s3', { what: 'Room TBA' }),
      ],
    };
    expect(checkBeforePublish(input)).toBeNull();
  });
});

describe('publishCheckCopy', () => {
  it('asks for a slot when there are none', () => {
    expect(publishCheckCopy({ kind: 'no_slots' })).toEqual({
      title: 'Nothing to sign up for yet',
      text: 'There are no slots yet. Add one, then publish.',
      fix: 'Add a slot',
      secondary: 'Not now',
    });
  });

  it('asks for a field when there are none, with no fix to offer', () => {
    expect(publishCheckCopy({ kind: 'no_fields' })).toEqual({
      title: 'Nothing to sign up for yet',
      text: 'Add a field that says what people sign up for, then publish.',
      fix: null,
      secondary: 'Not now',
    });
  });

  it('says the slot is empty when there is one', () => {
    expect(publishCheckCopy({ kind: 'all_blank', slotId: 's1', slotCount: 1 })).toEqual({
      title: 'Nothing to sign up for yet',
      text: 'The slot is empty. Say what people sign up for, then publish.',
      fix: 'Fill it in',
      secondary: 'Not now',
    });
  });

  it('says every slot is empty when there are several', () => {
    expect(publishCheckCopy({ kind: 'all_blank', slotId: 's1', slotCount: 4 })).toMatchObject({
      text: 'Every slot is empty. Say what people sign up for, then publish.',
    });
  });
});

describe('publishCheckTarget', () => {
  it('opens the first slot of an empty signup, focus in its first field', () => {
    expect(publishCheckTarget({ kind: 'all_blank', slotId: 's1', slotCount: 3 })).toEqual({
      slotId: 's1',
    });
  });

  it('adds a slot when there are none, and has nowhere to go without fields', () => {
    expect(publishCheckTarget({ kind: 'no_slots' })).toEqual({ slotId: null });
    expect(publishCheckTarget({ kind: 'no_fields' })).toBeNull();
  });

  it('has a target exactly when the copy offers a fix', () => {
    const checks: PublishCheck[] = [
      { kind: 'no_slots' },
      { kind: 'no_fields' },
      { kind: 'all_blank', slotId: 's1', slotCount: 1 },
    ];
    for (const check of checks) {
      expect(publishCheckTarget(check) !== null).toBe(publishCheckCopy(check).fix !== null);
    }
  });
});
