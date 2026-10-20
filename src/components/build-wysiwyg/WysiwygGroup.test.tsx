// @vitest-environment jsdom
import { describe, it, expect, vi, type Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WysiwygGroup, type SlotGroup } from './WysiwygGroup';
import type { BuildField, BuildRow } from '../build-shared/useBuildState';
import { FIELD_VALUE_INPUT_CLASS } from '../build-shared/fieldTypes';

function makeRow(overrides: Partial<BuildRow> = {}): BuildRow {
  return {
    id: 'r1',
    capacity: 2,
    sortOrder: 0,
    values: {},
    ...overrides,
  };
}

function makeField(overrides: Partial<BuildField> = {}): BuildField {
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
  groupField?: BuildField | null;
  displayFields?: BuildField[];
  fields?: BuildField[];
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
      takenBySlot={{}}
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
    expect(screen.getByRole('button', { name: /Group header.*Thu, May 21/ })).toBeTruthy();
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

  it('edits a date header in a date input that starts where the services do', () => {
    const { onRenameGroup } = renderGroup({
      group: { key: '2026-05-21', rawValue: '2026-05-21', rows: [makeRow()] },
    });
    fireEvent.click(screen.getByRole('button', { name: /Group header.*Thu, May 21/ }));
    const input = screen.getByLabelText(/Group header/) as HTMLInputElement;
    expect(input.type).toBe('date');
    expect(input.min).toBe('1900-01-01');
    fireEvent.change(input, { target: { value: '2026-05-22' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRenameGroup).toHaveBeenCalledOnce();
    expect(onRenameGroup).toHaveBeenCalledWith('2026-05-21', '2026-05-22');
  });

  it('boxes a date header\'s input as the slot editor does, not in the header\'s small caps', () => {
    renderGroup({ group: { key: '2026-05-21', rawValue: '2026-05-21', rows: [makeRow()] } });
    fireEvent.click(screen.getByRole('button', { name: /Group header.*Thu, May 21/ }));
    const input = screen.getByLabelText(/Group header/) as HTMLInputElement;
    expect(input.className).toBe(FIELD_VALUE_INPUT_CLASS);
  });

  it('leaves a date header alone when the date is only half typed', () => {
    const { onRenameGroup } = renderGroup({
      group: { key: '2026-05-21', rawValue: '2026-05-21', rows: [makeRow()] },
    });
    fireEvent.click(screen.getByRole('button', { name: /Group header.*Thu, May 21/ }));
    const input = screen.getByLabelText(/Group header/) as HTMLInputElement;
    // A date input reports '' until every part of the date is filled in.
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onRenameGroup).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Group header.*Thu, May 21/ })).toBeTruthy();
  });

  it('sets an empty date group from a blank date input', () => {
    const { onRenameGroup } = renderGroup({
      group: { key: '__empty__', rawValue: '', rows: [makeRow()] },
    });
    fireEvent.click(screen.getByRole('button', { name: /Group header.*Set a date/ }));
    const input = screen.getByLabelText(/Group header/) as HTMLInputElement;
    expect(input.type).toBe('date');
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: '2026-11-14' } });
    fireEvent.blur(input);
    expect(onRenameGroup).toHaveBeenCalledWith('__empty__', '2026-11-14');
  });

  it('offers only the list\'s choices for a List header', () => {
    const { onRenameGroup } = renderGroup({
      group: { key: 'Cups', rawValue: 'Cups', rows: [makeRow()] },
      groupField: makeField({
        ref: 'item',
        name: 'Item',
        config: { fieldType: 'enum', choices: ['Cups', 'Plates'] },
      }),
    });
    fireEvent.click(screen.getByRole('button', { name: /Group header.*Cups/ }));
    expect(screen.queryByRole('textbox')).toBeNull();
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Cups', 'Plates']);
    fireEvent.click(screen.getByRole('option', { name: 'Plates' }));
    expect(onRenameGroup).toHaveBeenCalledWith('Cups', 'Plates');
  });

  it('adds a new choice to the list before renaming a List header to it', async () => {
    const onAddEnumOption = vi.fn<(fieldId: string, value: string) => Promise<void>>().mockResolvedValue();
    const { onRenameGroup } = renderGroup({
      group: { key: 'Cups', rawValue: 'Cups', rows: [makeRow()] },
      groupField: makeField({
        id: 'f-item',
        ref: 'item',
        name: 'Item',
        config: { fieldType: 'enum', choices: ['Cups'] },
      }),
      onAddEnumOption,
    });
    fireEvent.click(screen.getByRole('button', { name: /Group header.*Cups/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to list' }));
    const input = screen.getByLabelText('New option name');
    fireEvent.change(input, { target: { value: 'Forks' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await vi.waitFor(() => expect(onRenameGroup).toHaveBeenCalledWith('Cups', 'Forks'));
    expect(onAddEnumOption).toHaveBeenCalledWith('f-item', 'Forks');
  });

  it('keeps free text for a Short text header', () => {
    const { onRenameGroup } = renderGroup({
      group: { key: 'Snacks', rawValue: 'Snacks', rows: [makeRow()] },
      groupField: makeField({ ref: 'what', name: 'What', config: { fieldType: 'text', maxLength: 200 } }),
    });
    fireEvent.click(screen.getByRole('button', { name: /Group header.*Snacks/ }));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Drinks' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRenameGroup).toHaveBeenCalledWith('Snacks', 'Drinks');
  });

  it('says so next to the header when its last change did not save', () => {
    render(
      <WysiwygGroup
        group={{ key: '2026-05-21', rawValue: '2026-05-21', rows: [] }}
        groupField={makeField()}
        displayFields={[]}
        fields={[makeField()]}
        takenBySlot={{}}
        expandedRowId={null}
        onExpandRow={vi.fn()}
        onEditCell={vi.fn()}
        onSetCapacity={vi.fn()}
        onAddEnumOption={vi.fn()}
        onDuplicateRow={vi.fn()}
        onDeleteRow={vi.fn()}
        onAddSlot={vi.fn()}
        onRenameGroup={vi.fn()}
        renameFailed
      />,
    );
    expect(screen.getByRole('alert').textContent).toMatch(/didn.t save/);
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
