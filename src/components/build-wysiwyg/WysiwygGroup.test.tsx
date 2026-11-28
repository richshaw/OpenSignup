// @vitest-environment jsdom
import { describe, it, expect, vi, type Mock } from 'vitest';
import { render as renderUi, screen, fireEvent } from '@testing-library/react';
import { WysiwygGroup, type SlotGroup } from './WysiwygGroup';
import type { BuildField, BuildRow } from '../build-shared/useBuildState';
import { FIELD_VALUE_INPUT_CLASS } from '../build-shared/fieldTypes';
import type { ReactElement } from 'react';
import { englishMessages } from '@/i18n/testing/client-messages';
import { BUILD_TAB_NAMESPACES } from './client-namespaces';

/** Renders `ui` with the Build tab's messages in English, as its page gives them. */
const wrapper = englishMessages(BUILD_TAB_NAMESPACES);
const render = (ui: ReactElement) => renderUi(ui, { wrapper });

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

function renderGroup(
  overrides: {
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
  } = {},
) {
  const onAddSlot = overrides.onAddSlot ?? vi.fn<(groupKey: string) => void>();
  const onRenameGroup =
    overrides.onRenameGroup ?? vi.fn<(oldKey: string, newKey: string) => void>();
  const onExpandRow = overrides.onExpandRow ?? vi.fn<(rowId: string | null) => void>();
  const onEditCell =
    overrides.onEditCell ?? vi.fn<(rowId: string, fieldRef: string, value: string) => void>();
  const onSetCapacity =
    overrides.onSetCapacity ?? vi.fn<(rowId: string, capacity: number | null) => void>();
  const onAddEnumOption =
    overrides.onAddEnumOption ?? vi.fn<(fieldId: string, value: string) => void | Promise<void>>();
  const onDuplicateRow = overrides.onDuplicateRow ?? vi.fn<(rowId: string) => void>();
  const onDeleteRow = overrides.onDeleteRow ?? vi.fn<(rowId: string) => void>();
  const group: SlotGroup = {
    key: '2026-05-21',
    rawValue: '2026-05-21',
    rows: [makeRow({ id: 'r1' }), makeRow({ id: 'r2' })],
    ...overrides.group,
  };
  const groupField = 'groupField' in overrides ? (overrides.groupField ?? null) : makeField();
  const utils = render(
    <WysiwygGroup
      group={group}
      groupField={groupField}
      displayFields={overrides.displayFields ?? []}
      fields={overrides.fields ?? (groupField ? [groupField] : [])}
      takenBySlot={{}}
      remindersOn={false}
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
  return {
    ...utils,
    onAddSlot,
    onRenameGroup,
    onExpandRow,
    onEditCell,
    onSetCapacity,
    onAddEnumOption,
    onDuplicateRow,
    onDeleteRow,
  };
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

  it('"Add a slot" below rows keeps its hover colour and its dashed top border', () => {
    renderGroup({ group: { key: '2026-05-21', rawValue: '2026-05-21', rows: [makeRow()] } });
    const classes = screen.getByRole('button', { name: 'Add a slot' }).className.split(/\s+/);
    expect(classes).toEqual(
      expect.arrayContaining(['hover:text-brand', 'border-t', 'border-dashed']),
    );
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

  it("boxes a date header's input as the slot editor does, not in the header's small caps", () => {
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

  it("offers only the list's choices for a List header", () => {
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
    const onAddEnumOption = vi
      .fn<(fieldId: string, value: string) => Promise<void>>()
      .mockResolvedValue();
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
      groupField: makeField({
        ref: 'what',
        name: 'What',
        config: { fieldType: 'text', maxLength: 200 },
      }),
    });
    fireEvent.click(screen.getByRole('button', { name: /Group header.*Snacks/ }));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Drinks' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRenameGroup).toHaveBeenCalledWith('Snacks', 'Drinks');
  });

  it('edits a Number header in a number input, as the slot editor does', () => {
    const { onRenameGroup } = renderGroup({
      group: { key: '3', rawValue: '3', rows: [makeRow()] },
      groupField: makeField({ ref: 'table', name: 'Table', config: { fieldType: 'number' } }),
    });
    fireEvent.click(screen.getByRole('button', { name: /Group header.*3/ }));
    const input = screen.getByLabelText(/Group header/) as HTMLInputElement;
    expect(input.type).toBe('number');
    expect(input.className).toBe(FIELD_VALUE_INPUT_CLASS);
    fireEvent.change(input, { target: { value: '4' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRenameGroup).toHaveBeenCalledWith('3', '4');
  });

  it('leaves a Number header alone when the input holds no number', () => {
    const { onRenameGroup } = renderGroup({
      group: { key: '3', rawValue: '3', rows: [makeRow()] },
      groupField: makeField({ ref: 'table', name: 'Table', config: { fieldType: 'number' } }),
    });
    fireEvent.click(screen.getByRole('button', { name: /Group header.*3/ }));
    const input = screen.getByLabelText(/Group header/) as HTMLInputElement;
    // A number input reports '' for anything that isn't a number.
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onRenameGroup).not.toHaveBeenCalled();
  });

  it('offers the time list for a Time header, not free text', () => {
    const { onRenameGroup } = renderGroup({
      group: { key: '09:00', rawValue: '09:00', rows: [makeRow()] },
      groupField: makeField({ ref: 'start', name: 'Start', config: { fieldType: 'time' } }),
    });
    expect(screen.queryByRole('textbox')).toBeNull();
    const select = screen.getByRole('combobox', {
      name: /Group header.*9:00/,
    }) as HTMLSelectElement;
    expect(select.value).toBe('09:00');
    fireEvent.change(select, { target: { value: '09:30' } });
    expect(onRenameGroup).toHaveBeenCalledWith('09:00', '09:30');
  });

  it('prompts for a time in an empty Time group, and never clears a set one', () => {
    const empty = renderGroup({
      group: { key: '__empty__', rawValue: '', rows: [makeRow()] },
      groupField: makeField({ ref: 'start', name: 'Start', config: { fieldType: 'time' } }),
    });
    const select = screen.getByRole('combobox', { name: /Group header.*Set a time/ });
    expect((select as HTMLSelectElement).selectedOptions[0]?.textContent).toBe('Set a time');
    fireEvent.change(select, { target: { value: '18:00' } });
    expect(empty.onRenameGroup).toHaveBeenCalledWith('__empty__', '18:00');
    empty.unmount();

    const set = renderGroup({
      group: { key: '09:00', rawValue: '09:00', rows: [makeRow()] },
      groupField: makeField({ ref: 'start', name: 'Start', config: { fieldType: 'time' } }),
    });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
    expect(set.onRenameGroup).not.toHaveBeenCalled();
  });

  it("stops a Short text header at its field's maxLength", () => {
    renderGroup({
      group: { key: 'Snacks', rawValue: 'Snacks', rows: [makeRow()] },
      groupField: makeField({
        ref: 'what',
        name: 'What',
        config: { fieldType: 'text', maxLength: 40 },
      }),
    });
    fireEvent.click(screen.getByRole('button', { name: /Group header.*Snacks/ }));
    expect((screen.getByRole('textbox') as HTMLInputElement).maxLength).toBe(40);
  });

  it('says so next to the header when its last change did not save', () => {
    render(
      <WysiwygGroup
        group={{ key: '2026-05-21', rawValue: '2026-05-21', rows: [] }}
        groupField={makeField()}
        displayFields={[]}
        fields={[makeField()]}
        takenBySlot={{}}
        remindersOn={false}
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
