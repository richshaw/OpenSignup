// @vitest-environment jsdom
import { describe, it, expect, vi, type Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WysiwygSlot } from './WysiwygSlot';
import type { GridField, GridRow } from '../build-grid/useGridState';

function makeField(overrides: Partial<GridField> = {}): GridField {
  return {
    id: 'f1',
    ref: 'shift',
    name: 'Shift',
    config: { fieldType: 'time' },
    sortOrder: 0,
    ...overrides,
  };
}

function makeRow(overrides: Partial<GridRow> = {}): GridRow {
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
  row?: GridRow;
  displayFields?: GridField[];
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
  const defaultDisplayFields: GridField[] = [
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
      fields={displayFields}
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
    expect(screen.getByText('09:00')).toBeTruthy();
    expect(screen.getByText('Bring sunscreen')).toBeTruthy();
    expect(screen.getByText('0/2')).toBeTruthy();
  });

  it('falls back to "Set a time" placeholder when the anchor is a time field with no value', () => {
    renderSlot({ row: makeRow({ values: { shift: '', notes: '' } }) });
    expect(screen.getByText('Set a time')).toBeTruthy();
  });

  it('renders 0/\u221e when capacity is null (unlimited)', () => {
    renderSlot({ row: makeRow({ capacity: null }) });
    expect(screen.getByText('0/\u221e')).toBeTruthy();
  });

  it('clicking the row body calls onExpand', () => {
    const { onExpand } = renderSlot();
    fireEvent.click(screen.getByRole('button', { name: /Edit slot at 09:00/ }));
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
      expect(screen.getByText('2026-05-29')).toBeTruthy();
      expect(screen.getByText('Mains \u00b7 17:00')).toBeTruthy();
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
