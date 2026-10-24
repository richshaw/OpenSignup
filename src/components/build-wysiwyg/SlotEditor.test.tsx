// @vitest-environment jsdom
import { describe, it, expect, vi, type Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SlotEditor } from './SlotEditor';
import type { BuildField, BuildRow } from '../build-shared/useBuildState';

function makeField(overrides: Partial<BuildField> = {}): BuildField {
  return {
    id: 'f1',
    ref: 'name',
    name: 'Name',
    config: { fieldType: 'text', maxLength: 200 },
    sortOrder: 0,
    ...overrides,
  };
}

function makeRow(overrides: Partial<BuildRow> = {}): BuildRow {
  return {
    id: 'r1',
    capacity: 2,
    sortOrder: 0,
    values: {},
    ...overrides,
  };
}

function renderEditor(overrides: {
  row?: BuildRow;
  fields?: BuildField[];
  taken?: number;
  remindersOn?: boolean;
  onCellChange?: Mock<(fieldRef: string, value: string) => void>;
  onCapacity?: Mock<(capacity: number | null) => void>;
  onAddEnumOption?: Mock<(fieldId: string, value: string) => void | Promise<void>>;
  onDuplicate?: Mock<() => void>;
  onDelete?: Mock<() => void>;
  onClose?: Mock<() => void>;
  focusOnOpen?: boolean;
  onFocused?: Mock<() => void>;
} = {}) {
  const onCellChange = overrides.onCellChange ?? vi.fn<(fieldRef: string, value: string) => void>();
  const onCapacity = overrides.onCapacity ?? vi.fn<(capacity: number | null) => void>();
  const onAddEnumOption = overrides.onAddEnumOption ?? vi.fn<(fieldId: string, value: string) => void | Promise<void>>();
  const onDuplicate = overrides.onDuplicate ?? vi.fn<() => void>();
  const onDelete = overrides.onDelete ?? vi.fn<() => void>();
  const onClose = overrides.onClose ?? vi.fn<() => void>();
  const utils = render(
    <SlotEditor
      row={overrides.row ?? makeRow({ values: { name: 'Existing' } })}
      fields={overrides.fields ?? [makeField()]}
      {...(overrides.focusOnOpen !== undefined ? { focusOnOpen: overrides.focusOnOpen } : {})}
      {...(overrides.onFocused ? { onFocused: overrides.onFocused } : {})}
      taken={overrides.taken ?? 0}
      remindersOn={overrides.remindersOn ?? true}
      onCellChange={onCellChange}
      onCapacity={onCapacity}
      onAddEnumOption={onAddEnumOption}
      onDuplicate={onDuplicate}
      onDelete={onDelete}
      onClose={onClose}
    />,
  );
  return { ...utils, onCellChange, onCapacity, onAddEnumOption, onDuplicate, onDelete, onClose };
}

describe('SlotEditor', () => {
  it('says nothing about sign-ups on a slot nobody holds', () => {
    renderEditor({ taken: 0 });
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('warns that the people holding the slot will be emailed about a move', () => {
    renderEditor({ taken: 2, remindersOn: true });
    expect(screen.getByRole('note').textContent).toBe(
      '2 people are signed up for this slot. If you change its date or time, we\u2019ll email them to let them know.',
    );
  });

  it('warns that nobody is told when reminders are off', () => {
    renderEditor({ taken: 1, remindersOn: false });
    expect(screen.getByRole('note').textContent).toBe(
      '1 person is signed up for this slot. Reminders are off, so we won\u2019t email them if you change it.',
    );
  });

  it("stops a text value at its field's maxLength", () => {
    renderEditor({
      fields: [
        makeField({ id: 'f1', ref: 'name', name: 'Name', config: { fieldType: 'text', maxLength: 40 } }),
        makeField({ id: 'f2', ref: 'date', name: 'Date', config: { fieldType: 'date' } }),
      ],
    });
    expect((screen.getByLabelText('Name value') as HTMLInputElement).maxLength).toBe(40);
    expect(screen.getByLabelText('Date value').hasAttribute('maxlength')).toBe(false);
  });

  it('renders one input per field plus a spots input', () => {
    renderEditor({
      fields: [
        makeField({ id: 'f1', ref: 'name', name: 'Name' }),
        makeField({ id: 'f2', ref: 'date', name: 'Date', config: { fieldType: 'date' } }),
      ],
      row: makeRow({ values: { name: 'Jane', date: '2026-05-21' } }),
    });
    expect((screen.getByLabelText('Name value') as HTMLInputElement).value).toBe('Jane');
    expect((screen.getByLabelText('Date value') as HTMLInputElement).value).toBe('2026-05-21');
    expect(screen.getByLabelText('Spots')).toBeTruthy();
  });

  it('typing into a field calls onCellChange with the field ref + value', () => {
    const { onCellChange } = renderEditor({
      fields: [makeField({ ref: 'name', name: 'Name' })],
      row: makeRow({ values: { name: '' } }),
    });
    fireEvent.change(screen.getByLabelText('Name value'), { target: { value: 'New' } });
    expect(onCellChange).toHaveBeenCalledWith('name', 'New');
  });

  it('capacity input clamps numeric values to >= 1', () => {
    const { onCapacity } = renderEditor({ row: makeRow({ capacity: 3 }) });
    const cap = screen.getByLabelText('Spots') as HTMLInputElement;
    fireEvent.change(cap, { target: { value: '5' } });
    expect(onCapacity).toHaveBeenLastCalledWith(5);
    fireEvent.change(cap, { target: { value: '-2' } });
    expect(onCapacity).toHaveBeenLastCalledWith(1);
    // Non-numeric input on a type=number control surfaces as '' and is
    // treated as unlimited, not clamped to 1.
    fireEvent.change(cap, { target: { value: 'abc' } });
    expect(onCapacity).toHaveBeenLastCalledWith(null);
  });

  it('clearing the capacity input sends null (unlimited)', () => {
    const { onCapacity } = renderEditor({ row: makeRow({ capacity: 3 }) });
    const cap = screen.getByLabelText('Spots') as HTMLInputElement;
    fireEvent.change(cap, { target: { value: '' } });
    expect(onCapacity).toHaveBeenLastCalledWith(null);
  });

  it('renders an empty input with a "No limit" placeholder when capacity is null', () => {
    renderEditor({ row: makeRow({ capacity: null }) });
    const cap = screen.getByLabelText('Spots') as HTMLInputElement;
    expect(cap.value).toBe('');
    expect(cap.placeholder).toBe('No limit');
  });

  it('describes the spots input with its helper line', () => {
    renderEditor();
    const cap = screen.getByLabelText('Spots');
    const helperId = cap.getAttribute('aria-describedby');
    expect(helperId).toBeTruthy();
    expect(document.getElementById(helperId!)?.textContent).toBe(
      'How many places people can take. Leave blank for no limit.',
    );
  });

  it('Done button calls onClose', () => {
    const { onClose } = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /Done/ }));
    expect(onClose).toHaveBeenCalled();
  });

  it('Delete button calls onDelete', () => {
    const { onDelete } = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /Delete/ }));
    expect(onDelete).toHaveBeenCalled();
  });

  it('Duplicate button calls onDuplicate', () => {
    const { onDuplicate } = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /Duplicate/ }));
    expect(onDuplicate).toHaveBeenCalled();
  });

  it('moves focus to the first field when focusOnOpen is set', () => {
    renderEditor({ focusOnOpen: true });
    expect(screen.getByRole('textbox', { name: 'Name value' })).toHaveFocus();
  });

  it('leaves focus alone when focusOnOpen is not set', () => {
    const onFocused = vi.fn<() => void>();
    renderEditor({ onFocused });
    expect(screen.getByRole('textbox', { name: 'Name value' })).not.toHaveFocus();
    expect(onFocused).not.toHaveBeenCalled();
  });

  it('calls onFocused once it has taken focus', () => {
    const onFocused = vi.fn<() => void>();
    renderEditor({ focusOnOpen: true, onFocused });
    expect(onFocused).toHaveBeenCalledTimes(1);
  });

  it('renders native input types for date / time / number fields', () => {
    renderEditor({
      fields: [
        makeField({ id: 'f1', ref: 'date', name: 'Date', config: { fieldType: 'date' } }),
        makeField({ id: 'f2', ref: 'time', name: 'Time', config: { fieldType: 'time' } }),
        makeField({ id: 'f3', ref: 'qty', name: 'Quantity', config: { fieldType: 'number' } }),
      ],
      row: makeRow({ values: {} }),
    });
    const date = screen.getByLabelText('Date value') as HTMLInputElement;
    expect(date.type).toBe('date');
    // The services refuse a date before 1900.
    expect(date.min).toBe('1900-01-01');
    expect((screen.getByLabelText('Time value') as HTMLInputElement).type).toBe('time');
    const qty = screen.getByLabelText('Quantity value') as HTMLInputElement;
    expect(qty.type).toBe('number');
    expect(qty.inputMode).toBe('numeric');
  });

  // A label around the picker passes each click inside the menu on to the
  // trigger, which reopened the menu after a pick and closed "Add to list".
  // jsdom can't show that (its React updates land after the label has checked
  // the click), so this pins the structure; tests/e2e/enum-picker.spec.ts
  // clicks through it in a browser.
  it('does not wrap a list picker in a label', () => {
    renderEditor({
      fields: [
        makeField({ id: 'f1', ref: 'name', name: 'Name' }),
        makeField({
          id: 'f2',
          ref: 'kind',
          name: 'Kind',
          config: { fieldType: 'enum', choices: ['Option 1'] },
        }),
      ],
      row: makeRow({ values: {} }),
    });
    expect(screen.getByTestId('enum-picker').closest('label')).toBeNull();
    expect(screen.getByRole('button', { name: 'Kind value' })).toBeTruthy();
    // Other cells keep their label.
    expect(screen.getByLabelText('Name value').closest('label')).not.toBeNull();
  });
});
