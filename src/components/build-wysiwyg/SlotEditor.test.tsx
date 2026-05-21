// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SlotEditor } from './SlotEditor';
import type { GridField, GridRow } from '../build-grid/useGridState';

function makeField(overrides: Partial<GridField> = {}): GridField {
  return {
    id: 'f1',
    ref: 'name',
    name: 'Name',
    type: 'text',
    config: { fieldType: 'text', maxLength: 200 },
    sortOrder: 0,
    ...overrides,
  };
}

function makeRow(overrides: Partial<GridRow> = {}): GridRow {
  return {
    id: 'r1',
    capacity: 2,
    sortOrder: 0,
    values: {},
    ...overrides,
  };
}

function renderEditor(overrides: {
  row?: GridRow;
  fields?: GridField[];
  onCellChange?: ReturnType<typeof vi.fn>;
  onCapacity?: ReturnType<typeof vi.fn>;
  onAddEnumOption?: ReturnType<typeof vi.fn>;
  onDuplicate?: ReturnType<typeof vi.fn>;
  onDelete?: ReturnType<typeof vi.fn>;
  onClose?: ReturnType<typeof vi.fn>;
} = {}) {
  const onCellChange = overrides.onCellChange ?? vi.fn();
  const onCapacity = overrides.onCapacity ?? vi.fn();
  const onAddEnumOption = overrides.onAddEnumOption ?? vi.fn();
  const onDuplicate = overrides.onDuplicate ?? vi.fn();
  const onDelete = overrides.onDelete ?? vi.fn();
  const onClose = overrides.onClose ?? vi.fn();
  const utils = render(
    <SlotEditor
      row={overrides.row ?? makeRow({ values: { name: 'Existing' } })}
      fields={overrides.fields ?? [makeField()]}
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
  it('renders one input per field plus a capacity input', () => {
    renderEditor({
      fields: [
        makeField({ id: 'f1', ref: 'name', name: 'Name' }),
        makeField({ id: 'f2', ref: 'date', name: 'Date', type: 'date', config: { fieldType: 'date' } }),
      ],
      row: makeRow({ values: { name: 'Jane', date: '2026-05-21' } }),
    });
    expect((screen.getByLabelText('Name value') as HTMLInputElement).value).toBe('Jane');
    expect((screen.getByLabelText('Date value') as HTMLInputElement).value).toBe('2026-05-21');
    expect(screen.getByLabelText('Capacity')).toBeTruthy();
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
    const cap = screen.getByLabelText('Capacity') as HTMLInputElement;
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
    const cap = screen.getByLabelText('Capacity') as HTMLInputElement;
    fireEvent.change(cap, { target: { value: '' } });
    expect(onCapacity).toHaveBeenLastCalledWith(null);
  });

  it('renders an empty input with an \u221e placeholder when capacity is null', () => {
    renderEditor({ row: makeRow({ capacity: null }) });
    const cap = screen.getByLabelText('Capacity') as HTMLInputElement;
    expect(cap.value).toBe('');
    expect(cap.placeholder).toBe('\u221e');
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
});
