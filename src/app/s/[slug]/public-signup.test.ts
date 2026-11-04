import { describe, expect, it } from 'vitest';
import { toPublicSignup } from './public-signup';

// A row as getPublicSignup loads it, with every server-only column filled in,
// so a key that leaks shows up in the lists below.
const ROW = {
  id: 'sig_internal',
  workspaceId: 'ws_internal',
  organizerId: 'org_internal',
  slug: 'snack-duty-abc123',
  title: 'Snack duty',
  description: 'Bring something to share',
  status: 'open',
  visibility: 'unlisted',
  theme: { accent: 'internal' },
  tags: ['internal-tag'],
  opensAt: null,
  closesAt: new Date('2030-05-01T00:00:00Z'),
  claimTokenHash: 'hash',
  settings: {
    requireEmail: false,
    sendReminders: true,
    groupByFieldRefs: ['date'],
    lockoutHoursBeforeSlot: 2,
    reminderFromFieldRef: 'date',
    confirmationMessage: 'Organizer-only note',
  },
  deletedAt: null,
  createdAt: new Date('2030-01-01T00:00:00Z'),
  updatedAt: new Date('2030-01-02T00:00:00Z'),
  fields: [
    {
      id: 'fld_internal',
      ref: 'date',
      label: 'Date',
      fieldType: 'date' as const,
      sortOrder: 0,
      config: { fieldType: 'date' as const },
    },
  ],
  slots: [
    {
      id: 'slot_1',
      workspaceId: 'ws_internal',
      signupId: 'sig_internal',
      ref: 'slot-1',
      values: { date: '2030-04-06' },
      slotAt: new Date('2030-04-06T12:00:00Z'),
      capacity: 3,
      status: 'open',
      priceCents: 500,
      sortOrder: 0,
      createdAt: new Date('2030-01-01T00:00:00Z'),
      updatedAt: new Date('2030-01-02T00:00:00Z'),
    },
  ],
  committedBySlot: { slot_1: 2 },
};

describe('toPublicSignup', () => {
  const pub = toPublicSignup(ROW);

  it('sends only the listed signup keys', () => {
    expect(Object.keys(pub).sort()).toEqual(
      [
        'closesAt',
        'committedBySlot',
        'description',
        'fields',
        'opensAt',
        'settings',
        'slots',
        'slug',
        'status',
        'title',
      ].sort(),
    );
    expect(Object.keys(pub.settings).sort()).toEqual(
      ['groupByFieldRefs', 'requireEmail', 'sendReminders'].sort(),
    );
  });

  it('sends each slot in the shape the page renders', () => {
    expect(pub.slots).toHaveLength(1);
    expect(Object.keys(pub.slots[0]!).sort()).toEqual(
      ['capacity', 'committed', 'hasTime', 'id', 'ref', 'slotAt', 'status', 'values'].sort(),
    );
    expect(pub.slots[0]).toMatchObject({ committed: 2, slotAt: '2030-04-06T12:00:00.000Z' });
  });

  it('sends each field without its id or sort order', () => {
    expect(pub.fields).toHaveLength(1);
    expect(Object.keys(pub.fields[0]!).sort()).toEqual(
      ['config', 'fieldType', 'label', 'ref'].sort(),
    );
  });

  it('copies the settings it keeps, with their defaults', () => {
    expect(pub.settings).toEqual({
      requireEmail: false,
      sendReminders: true,
      groupByFieldRefs: ['date'],
    });
    expect(toPublicSignup({ ...ROW, settings: {} }).settings).toEqual({
      requireEmail: true,
      sendReminders: true,
      groupByFieldRefs: [],
    });
  });
});
