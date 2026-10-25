// @vitest-environment jsdom
import { describe, it, expect, vi, type Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WysiwygSlot } from './WysiwygSlot';
import type { BuildField, BuildRow } from '../build-shared/useBuildState';
import type { SignupStatus } from '@/schemas/signups';

function makeField(overrides: Partial<BuildField> = {}): BuildField {
  return {
    id: 'f1',
    ref: 'shift',
    name: 'Shift',
    config: { fieldType: 'time' },
    sortOrder: 0,
    ...overrides,
  };
}

function makeRow(overrides: Partial<BuildRow> = {}): BuildRow {
  return {
    id: 'r1',
    capacity: 2,
    sortOrder: 0,
    values: { shift: '09:00', notes: 'Bring sunscreen' },
    ...overrides,
  };
}

type RenderProps = {
  expanded?: boolean;
  row?: BuildRow;
  taken?: number;
  displayFields?: BuildField[];
  /** Every field, the group's too; the display fields when not given. */
  fields?: BuildField[];
  status?: SignupStatus;
  onExpand?: Mock<() => void>;
  onCollapse?: Mock<() => void>;
  onEditCell?: Mock<(fieldRef: string, value: string) => void>;
  onSetCapacity?: Mock<(capacity: number | null) => void>;
  onAddEnumOption?: Mock<(fieldId: string, value: string) => void | Promise<void>>;
  onDuplicate?: Mock<() => void>;
  onDelete?: Mock<() => void>;
};

function renderSlot(overrides: RenderProps = {}) {
  const onExpand = overrides.onExpand ?? vi.fn<() => void>();
  const onCollapse = overrides.onCollapse ?? vi.fn<() => void>();
  const onEditCell = overrides.onEditCell ?? vi.fn<(fieldRef: string, value: string) => void>();
  const onSetCapacity = overrides.onSetCapacity ?? vi.fn<(capacity: number | null) => void>();
  const onAddEnumOption = overrides.onAddEnumOption ?? vi.fn<(fieldId: string, value: string) => void | Promise<void>>();
  const onDuplicate = overrides.onDuplicate ?? vi.fn<() => void>();
  const onDelete = overrides.onDelete ?? vi.fn<() => void>();
  const defaultDisplayFields: BuildField[] = [
    makeField({ ref: 'shift', name: 'Shift' }),
    makeField({
      id: 'f2',
      ref: 'notes',
      name: 'Notes',
      config: { fieldType: 'text', maxLength: 200 },
    }),
  ];
  const displayFields = overrides.displayFields ?? defaultDisplayFields;
  const utils = render(
    <WysiwygSlot
      row={overrides.row ?? makeRow()}
      taken={overrides.taken ?? 0}
      remindersOn={false}
      status={overrides.status ?? 'draft'}
      fields={overrides.fields ?? displayFields}
      displayFields={displayFields}
      expanded={overrides.expanded ?? false}
      onExpand={onExpand}
      onCollapse={onCollapse}
      onEditCell={onEditCell}
      onSetCapacity={onSetCapacity}
      onAddEnumOption={onAddEnumOption}
      onDuplicate={onDuplicate}
      onDelete={onDelete}
    />,
  );
  return { ...utils, onExpand, onCollapse, onEditCell, onSetCapacity, onAddEnumOption, onDuplicate, onDelete };
}

describe('WysiwygSlot — collapsed', () => {
  it('renders time, summary, and capacity', () => {
    renderSlot();
    expect(screen.getByText('9:00 AM')).toBeTruthy();
    expect(screen.getByText('Bring sunscreen')).toBeTruthy();
    expect(screen.getByText('0 of 2 taken')).toBeTruthy();
  });

  it('shows how many spots are taken on a slot people have signed up for', () => {
    renderSlot({ row: makeRow({ capacity: 3 }), taken: 3 });
    expect(screen.getByText('3 of 3 taken')).toBeTruthy();
    expect(screen.queryByText('0 of 3 taken')).toBeNull();
  });

  it('shows only the spots taken on an unlimited slot', () => {
    renderSlot({ row: makeRow({ capacity: null }), taken: 4 });
    expect(screen.getByText('4 taken')).toBeTruthy();
  });

  it('falls back to "Set a time" placeholder when the anchor is a time field with no value', () => {
    renderSlot({ row: makeRow({ values: { shift: '', notes: '' } }) });
    expect(screen.getByText('Set a time')).toBeTruthy();
  });

  it('renders "0 taken" when capacity is null (unlimited)', () => {
    renderSlot({ row: makeRow({ capacity: null }) });
    expect(screen.getByText('0 taken')).toBeTruthy();
  });

  it('clicking the row body calls onExpand', () => {
    const { onExpand } = renderSlot();
    fireEvent.click(screen.getByRole('button', { name: /Edit slot at 9:00\u00a0AM/ }));
    expect(onExpand).toHaveBeenCalled();
  });

  it('toolbar Edit button calls onExpand', () => {
    const { onExpand } = renderSlot();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onExpand).toHaveBeenCalled();
  });

  it('toolbar Duplicate calls onDuplicate and stops propagation (no expand)', () => {
    const { onExpand, onDuplicate } = renderSlot();
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    expect(onDuplicate).toHaveBeenCalled();
    expect(onExpand).not.toHaveBeenCalled();
  });

  it('toolbar Delete calls onDelete and stops propagation', () => {
    const { onExpand, onDelete } = renderSlot();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalled();
    expect(onExpand).not.toHaveBeenCalled();
  });

  describe('anchor = first field by order', () => {
    const date = makeField({
      id: 'f-date',
      ref: 'date',
      name: 'Date',
      config: { fieldType: 'date' },
    });
    const category = makeField({
      id: 'f-cat',
      ref: 'category',
      name: 'Item Category',
      config: { fieldType: 'enum', choices: ['Mains', 'Sides'] },
    });
    const time = makeField({
      id: 'f-time',
      ref: 'time',
      name: 'Time',
      config: { fieldType: 'time' },
    });
    const activity = makeField({
      id: 'f-act',
      ref: 'activity',
      name: 'Activity',
      config: { fieldType: 'text', maxLength: 200 },
    });
    const location = makeField({
      id: 'f-loc',
      ref: 'location',
      name: 'Location',
      config: { fieldType: 'text', maxLength: 200 },
    });

    it('uses the first field by order as the anchor, even when a later field is time-typed', () => {
      // Regression: Potluck signup (Date, Item Category, Time) used to highlight
      // Time because of the type-based promotion. Now Date — field 0 — wins.
      renderSlot({
        displayFields: [date, category, time],
        row: makeRow({ values: { date: '2026-05-29', category: 'Mains', time: '17:00' } }),
      });
      expect(screen.getByText('Fri, May 29')).toBeTruthy();
      expect(screen.getByText('Mains \u00b7 5:00 PM')).toBeTruthy();
    });

    it('promotes the first field value and drops it from the summary', () => {
      renderSlot({
        displayFields: [activity, location],
        row: makeRow({ values: { activity: 'Surfing', location: 'Cordoba' } }),
      });
      expect(screen.getByText('Surfing')).toBeTruthy();
      expect(screen.getByText('Cordoba')).toBeTruthy();
      expect(screen.queryByText(/Surfing \u00b7 Cordoba/)).toBeNull();
      expect(screen.queryByText('Slot')).toBeNull();
    });

    it('shows "Set <label>" placeholder (lowercased) when the anchor (non-date/time) is empty', () => {
      renderSlot({
        displayFields: [activity],
        row: makeRow({ values: { activity: '' } }),
      });
      expect(screen.getByText('Set activity')).toBeTruthy();
      expect(screen.queryByText('Slot')).toBeNull();
    });

    it('uses "Set a date" placeholder when the anchor is an empty date field', () => {
      renderSlot({
        displayFields: [date],
        row: makeRow({ values: { date: '' } }),
      });
      expect(screen.getByText('Set a date')).toBeTruthy();
    });

    it('keeps the index-0 placeholder even when later fields have values (no skip-to-next-non-empty)', () => {
      renderSlot({
        displayFields: [activity, location],
        row: makeRow({ values: { activity: '', location: 'Cordoba' } }),
      });
      expect(screen.getByText('Set activity')).toBeTruthy();
      expect(screen.getByText('Cordoba')).toBeTruthy();
    });

    it('falls back to literal "Slot" when there are no fields at all', () => {
      renderSlot({
        displayFields: [],
        row: makeRow({ values: {} }),
      });
      expect(screen.getByText('Slot')).toBeTruthy();
    });

    it('aria-label reflects the promoted non-time value with em-dash separator', () => {
      renderSlot({
        displayFields: [activity],
        row: makeRow({ values: { activity: 'Surfing' } }),
      });
      expect(screen.getByRole('button', { name: 'Edit slot \u2014 Surfing' })).toBeTruthy();
    });

    it('aria-label includes the placeholder when the anchor is empty (a11y parity with visible label)', () => {
      renderSlot({
        displayFields: [activity],
        row: makeRow({ values: { activity: '' } }),
      });
      expect(screen.getByRole('button', { name: 'Edit slot \u2014 Set activity' })).toBeTruthy();
    });

    it('aria-label uses "Set a time" placeholder when the anchor is an empty time field', () => {
      renderSlot({
        displayFields: [time],
        row: makeRow({ values: { time: '' } }),
      });
      expect(screen.getByRole('button', { name: 'Edit slot \u2014 Set a time' })).toBeTruthy();
    });
  });
});

describe('WysiwygSlot — a slot that still says TBD', () => {
  const marked = (notes: string) => makeRow({ values: { shift: '13:00', notes } });

  it('is warm, with a tag after its values that its name ends with', () => {
    renderSlot({ row: marked('Job TBD') });
    const row = screen.getByTestId('wysiwyg-slot-r1');
    expect(row.className).toMatch(/\bbg-warn\/5\b/);
    // Hover and focus still tint it, as any row.
    expect(row.className).toMatch(/\bhover:bg-surface-raised\/50\b/);
    expect(row.className).toMatch(/\bfocus-within:bg-surface-raised\/50\b/);
    const button = screen.getByRole('button', {
      name: 'Edit slot at 1:00\u00a0PM, still says “TBD”',
    });
    // After the anchor and the summary, inside the row's button.
    expect(button.textContent).toBe('1:00\u00a0PMJob TBDStill says “TBD”0 of 2 taken');
    expect(screen.getByText('Still says “TBD”').className).toMatch(/\btext-warn\b/);
  });

  it('keeps 10ch for the summary beside a tag on a computer, letting the tag wrap', () => {
    renderSlot({ row: marked('Job TBD') });
    const summary = screen.getByText('Job TBD');
    // At least 10ch, growing no wider than its text, so the tag follows it.
    expect(summary.className).toMatch(/\bmin-w-\[10ch\] max-w-max flex-1\b/);
    // Its line may wrap, so the tag can drop under the values.
    expect(summary.closest('button')?.firstElementChild?.className).not.toMatch(/md:flex-nowrap/);
  });

  it('leaves a row without a tag as it was', () => {
    renderSlot({ row: marked('Cashier') });
    const summary = screen.getByText('Cashier');
    expect(summary.className).toMatch(/\bmin-w-0\b/);
    expect(summary.className).not.toMatch(/10ch|flex-1/);
    expect(summary.closest('button')?.firstElementChild?.className).toMatch(/\bmd:flex-nowrap\b/);
  });

  it('says people can see it once published', () => {
    renderSlot({ row: marked('tba'), status: 'open' });
    expect(screen.getByText('People can see “TBA”')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Edit slot at 1:00\u00a0PM, people can see “TBA”' }),
    ).toBeTruthy();
  });

  it('counts the group’s field too, as Publish’s check does', () => {
    const where = makeField({
      id: 'f3',
      ref: 'where',
      name: 'Where',
      config: { fieldType: 'text', maxLength: 200 },
    });
    const shift = makeField();
    renderSlot({
      displayFields: [shift],
      fields: [where, shift],
      row: makeRow({ values: { where: 'Room TBC', shift: '13:00' } }),
    });
    expect(screen.getByText('Still says “TBC”')).toBeTruthy();
  });

  it('follows the slot’s values as they change, and goes once it’s named', () => {
    const notes = makeField({
      id: 'f2',
      ref: 'notes',
      name: 'Notes',
      config: { fieldType: 'text', maxLength: 200 },
    });
    const fields = [makeField(), notes];
    const { rerender } = renderSlot({ row: marked('TBD'), displayFields: fields });
    expect(screen.getByText('Still says “TBD”')).toBeTruthy();
    rerender(
      <WysiwygSlot
        row={marked('Cashier')}
        taken={0}
        remindersOn={false}
        status="draft"
        fields={fields}
        displayFields={fields}
        expanded={false}
        onExpand={vi.fn()}
        onCollapse={vi.fn()}
        onEditCell={vi.fn()}
        onSetCapacity={vi.fn()}
        onAddEnumOption={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByText(/still says/i)).toBeNull();
    const row = screen.getByTestId('wysiwyg-slot-r1');
    expect(row.className).not.toMatch(/bg-warn/);
    expect(screen.getByRole('button', { name: 'Edit slot at 1:00\u00a0PM' })).toBeTruthy();
  });

  it('isn’t marked for a near-miss', () => {
    renderSlot({ row: marked('Tbacco and TBDX') });
    expect(screen.queryByText(/still says/i)).toBeNull();
    expect(screen.getByTestId('wysiwyg-slot-r1').className).not.toMatch(/bg-warn/);
  });
});

describe('WysiwygSlot — expanded', () => {
  it('renders a SlotEditor with the row\'s values', () => {
    renderSlot({ expanded: true });
    expect(screen.getByText('Editing slot')).toBeTruthy();
    expect((screen.getByLabelText('Shift value') as HTMLInputElement).value).toBe('09:00');
    expect((screen.getByLabelText('Notes value') as HTMLInputElement).value).toBe('Bring sunscreen');
  });

  it('Done in the expanded editor calls onCollapse', () => {
    const { onCollapse } = renderSlot({ expanded: true });
    fireEvent.click(screen.getByRole('button', { name: /Done/ }));
    expect(onCollapse).toHaveBeenCalled();
  });
});
