// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FieldsPopover } from './FieldsPopover';
import type { GridField } from '../build-grid/useGridState';
import type { SlotFieldConfig } from '@/schemas/slot-fields';

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

type RenderProps = {
  fields?: GridField[];
  groupByFieldRef?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onAddField?: Mock<(name: string, config: SlotFieldConfig) => void>;
  onUpdateField?: Mock<(fieldId: string, patch: { name?: string; config?: SlotFieldConfig }) => void>;
  onDeleteField?: Mock<(fieldId: string) => void>;
  onMoveField?: Mock<(fieldId: string, toIdx: number) => void>;
  onGroupByChange?: Mock<(ref: string | null) => void>;
};

function renderPopover(overrides: RenderProps = {}) {
  const onOpenChange = overrides.onOpenChange ?? vi.fn<(open: boolean) => void>();
  const onAddField = overrides.onAddField ?? vi.fn<(name: string, config: SlotFieldConfig) => void>();
  const onUpdateField = overrides.onUpdateField ?? vi.fn<(fieldId: string, patch: { name?: string; config?: SlotFieldConfig }) => void>();
  const onDeleteField = overrides.onDeleteField ?? vi.fn<(fieldId: string) => void>();
  const onMoveField = overrides.onMoveField ?? vi.fn<(fieldId: string, toIdx: number) => void>();
  const onGroupByChange = overrides.onGroupByChange ?? vi.fn<(ref: string | null) => void>();
  const utils = render(
    <FieldsPopover
      open={overrides.open ?? true}
      onOpenChange={onOpenChange}
      fields={overrides.fields ?? [makeField()]}
      groupByFieldRef={overrides.groupByFieldRef ?? null}
      onAddField={onAddField}
      onUpdateField={onUpdateField}
      onDeleteField={onDeleteField}
      onMoveField={onMoveField}
      onGroupByChange={onGroupByChange}
    />,
  );
  return { ...utils, onOpenChange, onAddField, onUpdateField, onDeleteField, onMoveField, onGroupByChange };
}

beforeEach(() => {
  // Radix Dialog reads HTMLElement.prototype.hasPointerCapture which jsdom doesn't ship.
  if (!('hasPointerCapture' in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
      value: () => false,
      configurable: true,
    });
  }
});

describe('FieldsPopover', () => {
  it('renders a dialog titled "Fields · N" when open', () => {
    renderPopover({ fields: [makeField({ id: 'a' }), makeField({ id: 'b', ref: 'name', name: 'Name' })] });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(screen.getByText('Fields · 2')).toBeTruthy();
  });

  it('renders nothing when closed', () => {
    renderPopover({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lists each field with its name and type label', () => {
    renderPopover({
      fields: [
        makeField({ id: 'f1', name: 'StartDate', ref: 'startdate', config: { fieldType: 'date' } }),
        makeField({ id: 'f2', name: 'Shift', ref: 'shift', config: { fieldType: 'time' } }),
      ],
    });
    expect(screen.getByRole('button', { name: 'StartDate' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Shift' })).toBeTruthy();
    // Type-label badges
    expect(screen.getByText('Date')).toBeTruthy();
    expect(screen.getByText('Time')).toBeTruthy();
  });

  it('reports an enum field with its choice count', () => {
    renderPopover({
      fields: [
        makeField({
          id: 'e1',
          name: 'Course',
          ref: 'course',
          config: { fieldType: 'enum', choices: ['Main', 'Side', 'Dessert'] },
        }),
      ],
    });
    expect(screen.getByText('List · 3')).toBeTruthy();
  });

  it('Add field swaps to the create form', () => {
    renderPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
    expect(screen.getByText('New field')).toBeTruthy();
    expect(screen.queryByText(/^Fields ·/)).toBeNull();
  });

  it('Cancel from the create form returns to the list', () => {
    renderPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText(/Fields · 1/)).toBeTruthy();
  });

  it('saving from the create form calls onAddField and returns to the list', () => {
    const { onAddField } = renderPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
    fireEvent.change(screen.getByLabelText('Field name'), { target: { value: 'Teacher' } });
    fireEvent.click(screen.getByRole('button', { name: /^Add field$/ }));
    expect(onAddField).toHaveBeenCalledWith('Teacher', expect.objectContaining({ fieldType: 'text' }));
    expect(screen.getByText(/Fields · 1/)).toBeTruthy();
  });

  it('clicking a field name opens the edit form for that field', () => {
    const field = makeField({ id: 'x', name: 'Subject', ref: 'subject', config: { fieldType: 'text', maxLength: 200 } });
    renderPopover({ fields: [field] });
    fireEvent.click(screen.getByRole('button', { name: 'Subject' }));
    expect(screen.getByText('Edit field')).toBeTruthy();
    expect((screen.getByLabelText('Field name') as HTMLInputElement).value).toBe('Subject');
  });

  it('deleting a field via the row X calls onDeleteField', () => {
    const field = makeField({ id: 'x', name: 'Subject' });
    const { onDeleteField } = renderPopover({ fields: [field] });
    fireEvent.click(screen.getByRole('button', { name: 'Delete Subject' }));
    expect(onDeleteField).toHaveBeenCalledWith('x');
  });

  it('group-by picker offers each compatible field and "Don\u2019t group"', async () => {
    renderPopover({
      fields: [
        makeField({ id: 'd', name: 'StartDate', ref: 'startdate' }),
        makeField({ id: 't', name: 'Shift', ref: 'shift', config: { fieldType: 'time' } }),
        makeField({ id: 'e', name: 'Course', ref: 'course', config: { fieldType: 'enum', choices: [] } }),
      ],
    });
    // The trigger button's name matches the current selection — "Don't group" by default.
    const trigger = screen.getByRole('button', { name: /Don.t group/ });
    fireEvent.click(trigger);
    const listbox = await waitFor(() => screen.getByRole('listbox', { name: 'Group slots by' }));
    const optLabels = Array.from(listbox.querySelectorAll('[role="option"]')).map((o) =>
      o.textContent?.replace(/\s+/g, ' ').trim(),
    );
    // Don't group always rendered as the first option.
    expect(optLabels.some((l) => l && /Don.t group/.test(l))).toBe(true);
    expect(optLabels).toContain('StartDate');
    expect(optLabels).toContain('Course');
    // Time is intentionally excluded.
    expect(optLabels).not.toContain('Shift');
  });

  it('picking a group-by option calls onGroupByChange with the field ref', async () => {
    const { onGroupByChange } = renderPopover({
      fields: [makeField({ id: 'd', name: 'StartDate', ref: 'startdate' })],
    });
    fireEvent.click(screen.getByRole('button', { name: /Don.t group/ }));
    const dateOption = await waitFor(() => screen.getByRole('option', { name: 'StartDate' }));
    fireEvent.click(dateOption);
    expect(onGroupByChange).toHaveBeenCalledWith('startdate');
  });

  it('resets to the list view when reopened after a create form was open', () => {
    const { rerender, onAddField } = renderPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
    expect(screen.getByText('New field')).toBeTruthy();
    const noopOpen = vi.fn<(open: boolean) => void>();
    const noopUpdate = vi.fn<(fieldId: string, patch: { name?: string; config?: SlotFieldConfig }) => void>();
    const noopDelete = vi.fn<(fieldId: string) => void>();
    const noopMove = vi.fn<(fieldId: string, toIdx: number) => void>();
    const noopGroupBy = vi.fn<(ref: string | null) => void>();
    // Simulate close then re-open from the parent.
    rerender(
      <FieldsPopover
        open={false}
        onOpenChange={noopOpen}
        fields={[makeField()]}
        groupByFieldRef={null}
        onAddField={onAddField}
        onUpdateField={noopUpdate}
        onDeleteField={noopDelete}
        onMoveField={noopMove}
        onGroupByChange={noopGroupBy}
      />,
    );
    rerender(
      <FieldsPopover
        open
        onOpenChange={noopOpen}
        fields={[makeField()]}
        groupByFieldRef={null}
        onAddField={onAddField}
        onUpdateField={noopUpdate}
        onDeleteField={noopDelete}
        onMoveField={noopMove}
        onGroupByChange={noopGroupBy}
      />,
    );
    expect(screen.queryByText('New field')).toBeNull();
    expect(screen.getByText(/Fields · 1/)).toBeTruthy();
  });
});
