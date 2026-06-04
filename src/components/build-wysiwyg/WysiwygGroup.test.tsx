// @vitest-environment jsdom
import { describe, it, expect, vi, type Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WysiwygGroup, type SlotGroup } from './WysiwygGroup';
import type { GridField, GridRow } from '../build-grid/useGridState';

function makeRow(overrides: Partial<GridRow> = {}): GridRow {
  return {
    id: 'r1',
    capacity: 2,
    sortOrder: 0,
    values: {},
    ...overrides,
  };
}

function makeField(overrides: Partial<GridField> = {}): GridField {
  return {
    id: 'f1',
    ref: 'date',
    name: 'Date',
    config: { fieldType: 'date' },
    sortOrder: 0,
    ...overrides,
  };
}

function renderGroup(overrides: {
  group?: Partial<SlotGroup>;
  groupField?: GridField | null;
  displayFields?: GridField[];
  fields?: GridField[];
  expandedRowId?: string | null;
  onExpandRow?: Mock<(rowId: string | null) => void>;
  onEditCell?: Mock<(rowId: string, fieldRef: string, value: string) => void>;
  onSetCapacity?: Mock<(rowId: string, capacity: number | null) => void>;
  onAddEnumOption?: Mock<(fieldId: string, value: string) => void | Promise<void>>;
  onDuplicateRow?: Mock<(rowId: string) => void>;
  onDeleteRow?: Mock<(rowId: string) => void>;
  onAddSlot?: Mock<(groupKey: string) => void>;
  onRenameGroup?: Mock<(oldKey: string, newKey: string) => void>;
} = {}) {
  const onAddSlot = overrides.onAddSlot ?? vi.fn<(groupKey: string) => void>();
  const onRenameGroup = overrides.onRenameGroup ?? vi.fn<(oldKey: string, newKey: string) => void>();
  const onExpandRow = overrides.onExpandRow ?? vi.fn<(rowId: string | null) => void>();
  const onEditCell = overrides.onEditCell ?? vi.fn<(rowId: string, fieldRef: string, value: string) => void>();
  const onSetCapacity = overrides.onSetCapacity ?? vi.fn<(rowId: string, capacity: number | null) => void>();
  const onAddEnumOption = overrides.onAddEnumOption ?? vi.fn<(fieldId: string, value: string) => void | Promise<void>>();
  const onDuplicateRow = overrides.onDuplicateRow ?? vi.fn<(rowId: string) => void>();
  const onDeleteRow = overrides.onDeleteRow ?? vi.fn<(rowId: string) => void>();
  const group: SlotGroup = {
    key: '2026-05-21',
    rawValue: '2026-05-21',
    rows: [makeRow({ id: 'r1' }), makeRow({ id: 'r2' })],
    ...overrides.group,
  };
  const groupField =
    'groupField' in overrides ? overrides.groupField ?? null : makeField();
  const utils = render(
    <WysiwygGroup
      group={group}
      groupField={groupField}
      displayFields={overrides.displayFields ?? []}
      fields={overrides.fields ?? (groupField ? [groupField] : [])}
      expandedRowId={overrides.expandedRowId ?? null}
      onExpandRow={onExpandRow}
      onEditCell={onEditCell}
      onSetCapacity={onSetCapacity}
      onAddEnumOption={onAddEnumOption}
      onDuplicateRow={onDuplicateRow}
      onDeleteRow={onDeleteRow}
      onAddSlot={onAddSlot}
      onRenameGroup={onRenameGroup}
    />,
  );
  return { ...utils, onAddSlot, onRenameGroup, onExpandRow, onEditCell, onSetCapacity, onAddEnumOption, onDuplicateRow, onDeleteRow };
}

describe('WysiwygGroup', () => {
  it('renders one row per group row', () => {
    renderGroup();
    expect(screen.getByTestId('wysiwyg-slot-r1')).toBeTruthy();
    expect(screen.getByTestId('wysiwyg-slot-r2')).toBeTruthy();
  });

  it('renders the prettified date as the editable header', () => {
    renderGroup({ group: { rawValue: '2026-05-21', key: '2026-05-21' } });
    expect(screen.getByRole('button', { name: /Group header.*THU, MAY 21/ })).toBeTruthy();
  });

  it('omits the header when no group field is supplied (flat mode)', () => {
    renderGroup({ groupField: null, group: { key: '__flat__', rawValue: '' } });
    expect(screen.queryByRole('button', { name: /Group header/ })).toBeNull();
  });

  it('"Add a slot" calls onAddSlot with the group key', () => {
    const { onAddSlot } = renderGroup({ group: { key: '2026-05-21', rawValue: '2026-05-21' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add a slot' }));
    expect(onAddSlot).toHaveBeenCalledWith('2026-05-21');
  });

  it('renaming the header calls onRenameGroup with old and new keys', () => {
    const { onRenameGroup } = renderGroup({
      group: { key: '2026-05-21', rawValue: '2026-05-21', rows: [makeRow()] },
    });
    fireEvent.click(screen.getByRole('button', { name: /Group header.*THU, MAY 21/ }));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2026-05-22' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRenameGroup).toHaveBeenCalledWith('2026-05-21', '2026-05-22');
  });

  it('shows "Set a date" placeholder for the empty-bucket header on a date group field', () => {
    renderGroup({
      group: { key: '__empty__', rawValue: '', rows: [makeRow()] },
      groupField: makeField({ config: { fieldType: 'date' } }),
    });
    expect(screen.getByRole('button', { name: /Group header.*Set a date/ })).toBeTruthy();
    // Visible placeholder must match the aria-label — not the ISO format string.
    expect(screen.getByText('Set a date')).toBeTruthy();
  });

  it('derives empty-bucket placeholder from the field label for non-date types', () => {
    renderGroup({
      group: { key: '__empty__', rawValue: '', rows: [makeRow()] },
      groupField: makeField({
        ref: 'what',
        name: 'What',
        config: { fieldType: 'text', maxLength: 200 },
      }),
    });
    expect(screen.getByRole('button', { name: /Group header.*Set what/ })).toBeTruthy();
    expect(screen.getByText('Set what')).toBeTruthy();
  });
});
