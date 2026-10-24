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
const time = field('time', 'time', 'Time');

/** How the warning ends. */
const LATER = 'People will see that, and a published signup can’t go back to being a draft.';

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

    it('comes before a placeholder held under a ref that is not a field', () => {
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

  describe('placeholder', () => {
    it('warns about every slot holding TBD, TBC or TBA, naming the first by its other values', () => {
      const input = {
        fields: [what, date, time],
        slots: [
          slot('s1', { what: 'Setup', date: '2026-11-14', time: '09:00' }),
          slot('s2', { what: 'TBD', date: '2026-11-14', time: '13:00' }),
          slot('s3', { what: 'Venue tba', date: '2026-11-15' }),
        ],
      };
      expect(checkBeforePublish(input)).toEqual({
        kind: 'placeholder',
        slotIds: ['s2', 's3'],
        words: ['TBD', 'TBA'],
        fieldRef: 'what',
        slotLabel: 'Sat, Nov 14 · 1:00 PM',
      });
    });

    it('matches the word in any case and reports it in capitals', () => {
      for (const [value, word] of [
        ['tbd', 'TBD'],
        ['Kickoff (tbc)', 'TBC'],
        ['Room: Tba', 'TBA'],
        ['TBD.', 'TBD'],
      ] as const) {
        const check = checkBeforePublish({ fields: [what], slots: [slot('s1', { what: value })] });
        expect(check).toMatchObject({ kind: 'placeholder', words: [word] });
      }
    });

    it('leaves the letters alone inside another word', () => {
      const input = {
        fields: [what],
        slots: ['TBDX', 'xTBD', 'TBD1', 'Tbacco', 'ÉTBA', 'TBD_2'].map((v, i) =>
          slot(`s${i}`, { what: v }),
        ),
      };
      expect(checkBeforePublish(input)).toBeNull();
    });

    it('reads enum values too, and ignores values that are not strings', () => {
      const status = field('status', 'enum', 'Status');
      const count = field('count', 'number', 'Count');
      const input = {
        fields: [status, count],
        slots: [
          slot('s1', { status: 'Confirmed', count: 3 }),
          slot('s2', { status: 'TBA', count: 2 }),
        ],
      };
      expect(checkBeforePublish(input)).toEqual({
        kind: 'placeholder',
        slotIds: ['s2'],
        words: ['TBA'],
        fieldRef: 'status',
        slotLabel: '2',
      });
    });

    it('ignores values that are not strings, even ones that would print as TBD', () => {
      const input = { fields: [what], slots: [slot('s1', { what: ['TBD'] })] };
      expect(checkBeforePublish(input)).toBeNull();
    });

    it('only reads the signup’s own fields', () => {
      const input = { fields: [what], slots: [slot('s1', { what: 'Setup', gone: 'TBD' })] };
      expect(checkBeforePublish(input)).toBeNull();
    });

    it('takes the field from the first slot holding a word, and each slot’s first word in field order', () => {
      const where = field('where', 'text', 'Where');
      const input = {
        fields: [what, where],
        slots: [
          slot('s1', { what: 'Setup' }),
          slot('s2', { what: 'Kickoff TBC', where: 'TBD' }),
          slot('s3', { what: 'TBA' }),
        ],
      };
      expect(checkBeforePublish(input)).toMatchObject({
        slotIds: ['s2', 's3'],
        words: ['TBC', 'TBA'],
        fieldRef: 'what',
      });
    });

    it('lists each word once, in the order the slots hold them', () => {
      const input = {
        fields: [what],
        slots: [
          slot('s1', { what: 'tba' }),
          slot('s2', { what: 'TBD' }),
          slot('s3', { what: 'Room TBA' }),
          slot('s4', { what: 'Kickoff TBC' }),
        ],
      };
      expect(checkBeforePublish(input)).toMatchObject({
        slotIds: ['s1', 's2', 's3', 's4'],
        words: ['TBA', 'TBD', 'TBC'],
      });
    });

    it('names the field the word is in, not the first field', () => {
      const where = field('where', 'text', 'Where');
      const input = {
        fields: [what, where],
        slots: [slot('s1', { what: 'Setup', where: 'TBA' })],
      };
      expect(checkBeforePublish(input)).toMatchObject({ fieldRef: 'where', slotLabel: 'Setup' });
    });

    it('names the slot by a value the word is part of, so it doesn’t read as the date', () => {
      const input = {
        fields: [what, date],
        slots: [
          slot('s1', { what: 'Cashier TBD', date: '2026-11-14' }),
          slot('s2', { what: 'Grill', date: '2026-11-14' }),
        ],
      };
      const check = checkBeforePublish(input);
      expect(check).toMatchObject({ slotIds: ['s1'], slotLabel: 'Cashier TBD · Sat, Nov 14' });
      expect(publishCheckCopy(check!).text).toBe(
        `Cashier TBD · Sat, Nov 14 still says “TBD”. ${LATER}`,
      );
    });

    it.each([
      ['(TBD)', 'TBD', 'Fruit and water · Sat, Apr 6'],
      ['TBD.', 'TBD', 'Fruit and water · Sat, Apr 6'],
      ['TBD?', 'TBD', 'Fruit and water · Sat, Apr 6'],
      [' tbd ', 'TBD', 'Fruit and water · Sat, Apr 6'],
      ['TBD/TBC', 'TBD', 'Fruit and water · Sat, Apr 6'],
      ['TBD TBD', 'TBD', 'Fruit and water · Sat, Apr 6'],
      ['tba, tbc', 'TBA', 'Fruit and water · Sat, Apr 6'],
      ['Cashier TBD', 'TBD', 'Fruit and water · Sat, Apr 6 · Cashier TBD'],
    ])('names a slot whose Who is %j, which says %s, as “%s”', (value, word, slotLabel) => {
      const who = field('who', 'text', 'Who');
      const input = {
        fields: [what, date, who],
        slots: [slot('s1', { what: 'Fruit and water', date: '2030-04-06', who: value })],
      };
      expect(checkBeforePublish(input)).toMatchObject({
        fieldRef: 'who',
        words: [word],
        slotLabel,
      });
    });

    it('keeps a value it doesn’t count as the words, such as “TBD_TBC”', () => {
      const who = field('who', 'text', 'Who');
      const input = {
        fields: [what, who],
        slots: [slot('s1', { what: 'Grill TBD', who: 'TBD_TBC' })],
      };
      expect(checkBeforePublish(input)).toMatchObject({
        fieldRef: 'what',
        slotLabel: 'Grill TBD · TBD_TBC',
      });
    });

    it('leaves out a field whose whole value is the word', () => {
      const who = field('who', 'text', 'Who');
      const input = {
        fields: [what, date, who],
        slots: [slot('s1', { what: 'Fruit and water', date: '2030-04-06', who: 'TBA' })],
      };
      const check = checkBeforePublish(input);
      expect(check).toMatchObject({ fieldRef: 'who', slotLabel: 'Fruit and water · Sat, Apr 6' });
      expect(publishCheckCopy(check!).text).toBe(
        `Fruit and water · Sat, Apr 6 still says “TBA”. ${LATER}`,
      );
    });

    it('leaves out a value that is only the word in any case, and every empty one, but no other', () => {
      const where = field('where', 'text', 'Where');
      const input = {
        fields: [what, date, where, time],
        slots: [
          slot('s1', { what: 'Cashier TBD', date: '2026-11-14', where: ' tba ', time: '  ' }),
        ],
      };
      expect(checkBeforePublish(input)).toMatchObject({ slotLabel: 'Cashier TBD · Sat, Nov 14' });
    });

    it('gives an empty label when the slot has no other values', () => {
      const input = { fields: [what, date], slots: [slot('s1', { what: 'TBD' })] };
      expect(checkBeforePublish(input)).toMatchObject({ slotIds: ['s1'], slotLabel: '' });
    });

    it('is checked only when nothing blocks', () => {
      const input = { fields: [what], slots: [slot('s1', {}), slot('s2', { what: 'TBD' })] };
      expect(checkBeforePublish(input)).toMatchObject({ kind: 'placeholder', slotIds: ['s2'] });
    });
  });
});

describe('publishCheckCopy', () => {
  it('asks for a slot when there are none', () => {
    expect(publishCheckCopy({ kind: 'no_slots' })).toEqual({
      blocking: true,
      title: 'Nothing to sign up for yet',
      text: 'There are no slots yet. Add one, then publish.',
      fix: 'Add a slot',
      secondary: 'Not now',
    });
  });

  it('asks for a field when there are none, with no fix to offer', () => {
    expect(publishCheckCopy({ kind: 'no_fields' })).toEqual({
      blocking: true,
      title: 'Nothing to sign up for yet',
      text: 'Add a field that says what people sign up for, then publish.',
      fix: null,
      secondary: 'Not now',
    });
  });

  it('says the slot is empty when there is one', () => {
    expect(publishCheckCopy({ kind: 'all_blank', slotId: 's1', slotCount: 1 })).toEqual({
      blocking: true,
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

  it('names the one slot still holding a placeholder', () => {
    const check: PublishCheck = {
      kind: 'placeholder',
      slotIds: ['s2'],
      words: ['TBD'],
      fieldRef: 'what',
      slotLabel: 'Sat, Nov 14 · 1:00 PM',
    };
    expect(publishCheckCopy(check)).toEqual({
      blocking: false,
      title: 'Before people see it',
      text: `Sat, Nov 14 · 1:00 PM still says “TBD”. ${LATER}`,
      fix: 'Name it first',
      secondary: 'Publish anyway',
    });
  });

  it('says “One slot” when that slot has nothing else to name it by', () => {
    const check: PublishCheck = {
      kind: 'placeholder',
      slotIds: ['s1'],
      words: ['TBA'],
      fieldRef: 'what',
      slotLabel: '',
    };
    expect(publishCheckCopy(check).text).toBe(`One slot still says “TBA”. ${LATER}`);
  });

  it('names every word the slots still say', () => {
    const two: PublishCheck = {
      kind: 'placeholder',
      slotIds: ['s1', 's2', 's3'],
      words: ['TBD', 'TBA'],
      fieldRef: 'what',
      slotLabel: 'Setup',
    };
    expect(publishCheckCopy(two).text).toBe(`3 slots still say “TBD” or “TBA”. ${LATER}`);
    const three: PublishCheck = { ...two, words: ['TBA', 'TBD', 'TBC'] };
    expect(publishCheckCopy(three).text).toBe(`3 slots still say “TBA”, “TBD” or “TBC”. ${LATER}`);
  });

  it('counts the slots when there are several', () => {
    const check: PublishCheck = {
      kind: 'placeholder',
      slotIds: ['s1', 's2', 's3'],
      words: ['TBD'],
      fieldRef: 'what',
      slotLabel: 'Setup',
    };
    expect(publishCheckCopy(check)).toMatchObject({
      blocking: false,
      text: `3 slots still say “TBD”. ${LATER}`,
      fix: 'Name it first',
      secondary: 'Publish anyway',
    });
  });
});

describe('publishCheckTarget', () => {
  it('opens the first slot of an empty signup, focus in its first field', () => {
    expect(publishCheckTarget({ kind: 'all_blank', slotId: 's1', slotCount: 3 })).toEqual({
      slotId: 's1',
      fieldRef: null,
    });
  });

  it('opens the first slot still saying TBD, focus in the field that says it', () => {
    const check: PublishCheck = {
      kind: 'placeholder',
      slotIds: ['s2', 's3'],
      words: ['TBD'],
      fieldRef: 'where',
      slotLabel: 'Setup',
    };
    expect(publishCheckTarget(check)).toEqual({ slotId: 's2', fieldRef: 'where' });
  });

  it('adds a slot when there are none, and has nowhere to go without fields', () => {
    expect(publishCheckTarget({ kind: 'no_slots' })).toEqual({ slotId: null, fieldRef: null });
    expect(publishCheckTarget({ kind: 'no_fields' })).toBeNull();
  });

  it('has a target exactly when the copy offers a fix', () => {
    const checks: PublishCheck[] = [
      { kind: 'no_slots' },
      { kind: 'no_fields' },
      { kind: 'all_blank', slotId: 's1', slotCount: 1 },
      { kind: 'placeholder', slotIds: ['s1'], words: ['TBA'], fieldRef: 'what', slotLabel: '' },
    ];
    for (const check of checks) {
      expect(publishCheckTarget(check) !== null).toBe(publishCheckCopy(check).fix !== null);
    }
  });
});
