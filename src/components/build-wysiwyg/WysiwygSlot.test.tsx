// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
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
  timeField?: GridField | null;
  otherFields?: GridField[];
  onExpand?: ReturnType<typeof vi.fn>;
  onCollapse?: ReturnType<typeof vi.fn>;
  onEditCell?: ReturnType<typeof vi.fn>;
  onSetCapacity?: ReturnType<typeof vi.fn>;
  onAddEnumOption?: ReturnType<typeof vi.fn>;
  onDuplicate?: ReturnType<typeof vi.fn>;
  onDelete?: ReturnType<typeof vi.fn>;
};

function renderSlot(overrides: RenderProps = {}) {
  const onExpand = overrides.onExpand ?? vi.fn();
  const onCollapse = overrides.onCollapse ?? vi.fn();
  const onEditCell = overrides.onEditCell ?? vi.fn();
  const onSetCapacity = overrides.onSetCapacity ?? vi.fn();
  const onAddEnumOption = overrides.onAddEnumOption ?? vi.fn();
  const onDuplicate = overrides.onDuplicate ?? vi.fn();
  const onDelete = overrides.onDelete ?? vi.fn();
  const defaultTimeField = makeField({ ref: 'shift', name: 'Shift' });
  const defaultOtherField = makeField({
    id: 'f2',
    ref: 'notes',
    name: 'Notes',
    config: { fieldType: 'text', maxLength: 200 },
  });
  const timeField = overrides.timeField === undefined ? defaultTimeField : overrides.timeField;
  const otherFields = overrides.otherFields ?? [defaultOtherField];
  const fields = [...(timeField ? [timeField] : []), ...otherFields];
  const utils = render(
    <WysiwygSlot
      row={overrides.row ?? makeRow()}
      fields={fields}
      timeField={timeField}
      otherFields={otherFields}
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

  it('falls back to "Set a time" placeholder when the time field is empty', () => {
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

  describe('no time field', () => {
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

    it('promotes the first other field value to the primary label and drops it from the summary', () => {
      renderSlot({
        timeField: null,
        otherFields: [activity, location],
        row: makeRow({ values: { activity: 'Surfing', location: 'Cordoba' } }),
      });
      expect(screen.getByText('Surfing')).toBeTruthy();
      expect(screen.getByText('Cordoba')).toBeTruthy();
      expect(screen.queryByText(/Surfing \u00b7 Cordoba/)).toBeNull();
      expect(screen.queryByText('Slot')).toBeNull();
    });

    it('shows "Set ${name}" placeholder when the first other field is empty', () => {
      renderSlot({
        timeField: null,
        otherFields: [activity],
        row: makeRow({ values: { activity: '' } }),
      });
      expect(screen.getByText('Set Activity')).toBeTruthy();
      expect(screen.queryByText('Slot')).toBeNull();
    });

    it('keeps the index-0 placeholder even when later fields have values (no skip-to-next-non-empty)', () => {
      renderSlot({
        timeField: null,
        otherFields: [activity, location],
        row: makeRow({ values: { activity: '', location: 'Cordoba' } }),
      });
      expect(screen.getByText('Set Activity')).toBeTruthy();
      expect(screen.getByText('Cordoba')).toBeTruthy();
    });

    it('falls back to literal "Slot" when there are no fields at all', () => {
      renderSlot({
        timeField: null,
        otherFields: [],
        row: makeRow({ values: {} }),
      });
      expect(screen.getByText('Slot')).toBeTruthy();
    });

    it('aria-label on the expand button reflects the promoted value', () => {
      renderSlot({
        timeField: null,
        otherFields: [activity],
        row: makeRow({ values: { activity: 'Surfing' } }),
      });
      expect(screen.getByRole('button', { name: 'Edit slot \u2014 Surfing' })).toBeTruthy();
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
