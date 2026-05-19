// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GridHeader } from './GridHeader';
import type { GridField } from './useGridState';

const sampleFields: GridField[] = [
  {
    id: 'sf_1',
    ref: 'r1',
    name: 'Date',
    type: 'date',
    config: { fieldType: 'date' },
    sortOrder: 0,
  },
  {
    id: 'sf_2',
    ref: 'r2',
    name: 'Notes',
    type: 'text',
    config: { fieldType: 'text', maxLength: 200 },
    sortOrder: 1,
  },
  {
    id: 'sf_3',
    ref: 'r3',
    name: 'Shift',
    type: 'time',
    config: { fieldType: 'time' },
    sortOrder: 2,
  },
];

function renderHeader(overrides: Partial<React.ComponentProps<typeof GridHeader>> = {}) {
  return render(
    <GridHeader
      fields={sampleFields}
      onEditField={vi.fn()}
      onAddField={vi.fn()}
      onMoveField={vi.fn()}
      onResize={vi.fn()}
      onResetWidth={vi.fn()}
      {...overrides}
    />,
  );
}

describe('<GridHeader />', () => {
  it('renders exactly one "Add field" entry point in the trailing cell', () => {
    renderHeader();
    const addButtons = screen.getAllByRole('button', { name: /add field/i });
    expect(addButtons).toHaveLength(1);
    expect(addButtons[0]).toHaveTextContent(/Add field/i);
  });

  it('does not render an "Add column" button anywhere', () => {
    renderHeader();
    expect(screen.queryByRole('button', { name: /add column/i })).toBeNull();
  });

  it('fires onAddField when the trailing link is clicked', () => {
    const onAddField = vi.fn();
    renderHeader({ onAddField });
    screen.getByRole('button', { name: /add field/i }).click();
    expect(onAddField).toHaveBeenCalledTimes(1);
  });

  it('renders one pencil edit button per field', () => {
    renderHeader();
    const editButtons = screen.getAllByRole('button', { name: /^Edit field /i });
    expect(editButtons).toHaveLength(sampleFields.length);
  });

  it('opens the editor with the clicked field when the pencil is clicked', () => {
    const onEditField = vi.fn();
    renderHeader({ onEditField });
    const editNotes = screen.getByRole('button', { name: /^Edit field Notes/i });
    editNotes.click();
    expect(onEditField).toHaveBeenCalledTimes(1);
    expect(onEditField.mock.calls[0]?.[0]).toMatchObject({ id: 'sf_2', name: 'Notes' });
  });

  it('moves field left by one with Cmd+ArrowLeft on the focused pencil', () => {
    const onMoveField = vi.fn();
    renderHeader({ onMoveField });
    const editNotes = screen.getByRole('button', { name: /^Edit field Notes/i });
    fireEvent.keyDown(editNotes, { key: 'ArrowLeft', metaKey: true });
    expect(onMoveField).toHaveBeenCalledWith('sf_2', 0);
  });

  it('moves field right by one with Ctrl+ArrowRight on the focused pencil', () => {
    const onMoveField = vi.fn();
    renderHeader({ onMoveField });
    const editNotes = screen.getByRole('button', { name: /^Edit field Notes/i });
    fireEvent.keyDown(editNotes, { key: 'ArrowRight', ctrlKey: true });
    expect(onMoveField).toHaveBeenCalledWith('sf_2', 2);
  });

  it('does not move past the start (Cmd+ArrowLeft on first field)', () => {
    const onMoveField = vi.fn();
    renderHeader({ onMoveField });
    const editDate = screen.getByRole('button', { name: /^Edit field Date/i });
    fireEvent.keyDown(editDate, { key: 'ArrowLeft', metaKey: true });
    expect(onMoveField).not.toHaveBeenCalled();
  });

  it('moves to start with Cmd+Home and to end with Cmd+End', () => {
    const onMoveField = vi.fn();
    renderHeader({ onMoveField });
    const editShift = screen.getByRole('button', { name: /^Edit field Shift/i });
    fireEvent.keyDown(editShift, { key: 'Home', metaKey: true });
    expect(onMoveField).toHaveBeenCalledWith('sf_3', 0);

    onMoveField.mockClear();
    const editDate = screen.getByRole('button', { name: /^Edit field Date/i });
    fireEvent.keyDown(editDate, { key: 'End', metaKey: true });
    expect(onMoveField).toHaveBeenCalledWith('sf_1', sampleFields.length - 1);
  });

  it('ignores arrow keys without a Cmd/Ctrl modifier', () => {
    const onMoveField = vi.fn();
    renderHeader({ onMoveField });
    const editNotes = screen.getByRole('button', { name: /^Edit field Notes/i });
    fireEvent.keyDown(editNotes, { key: 'ArrowLeft' });
    fireEvent.keyDown(editNotes, { key: 'ArrowRight' });
    expect(onMoveField).not.toHaveBeenCalled();
  });

  it('renders a polite aria-live region for reorder announcements', () => {
    const { container } = renderHeader();
    const live = container.querySelector('[data-grid-header-announcement]');
    expect(live).not.toBeNull();
    expect(live).toHaveAttribute('aria-live', 'polite');
  });

  it('drag handle is not exposed as a button to assistive tech', () => {
    // Per-column buttons should only be the pencils. The drag handle is
    // mouse-only (keyboard reorder lives on the pencil), so exposing it as
    // a non-focusable button with no Enter/Space behavior would mislead SR users.
    renderHeader();
    const editButtons = screen.getAllByRole('button', { name: /^Edit field /i });
    expect(editButtons).toHaveLength(sampleFields.length);
    expect(screen.queryByRole('button', { name: /drag to reorder/i })).toBeNull();
  });

  describe('drag-drop reorder', () => {
    // Returns the column container for a given field id — the element that
    // receives the drop target props from useReorderable.
    function columnByFieldId(fieldId: string): HTMLElement {
      const fieldName = sampleFields.find((f) => f.id === fieldId)!.name;
      const pencil = screen.getByRole('button', {
        name: new RegExp(`^Edit field ${fieldName}`, 'i'),
      });
      return pencil.parentElement as HTMLElement;
    }

    function dragColumnOnto(sourceFieldId: string, targetFieldId: string) {
      const sourceCol = columnByFieldId(sourceFieldId);
      const targetCol = columnByFieldId(targetFieldId);
      const sourceHandle = sourceCol.querySelector('[title="Drag to reorder"]');
      expect(sourceHandle).not.toBeNull();
      const dt = { setData: () => undefined, effectAllowed: '' };
      fireEvent.dragStart(sourceHandle!, { dataTransfer: dt });
      fireEvent.dragOver(targetCol, { dataTransfer: dt });
      fireEvent.drop(targetCol, { dataTransfer: dt });
    }

    it('forward drag lands the source on the target\'s left edge', () => {
      // Fields are [Date, Notes, Shift]. Drag Date (idx 0) → drop on Shift
      // (idx 2). User expects [Notes, Date, Shift] — Date sits where Shift's
      // left edge was. With the raw pre-move target index (2), `moveField`
      // splices Date out then inserts at 2, yielding [Notes, Shift, Date].
      // The adjusted index (1) is correct.
      const onMoveField = vi.fn();
      renderHeader({ onMoveField });
      dragColumnOnto('sf_1', 'sf_3');
      expect(onMoveField).toHaveBeenCalledTimes(1);
      expect(onMoveField).toHaveBeenCalledWith('sf_1', 1);
    });

    it('backward drag passes the target index unchanged', () => {
      // Drag Shift (idx 2) → drop on Date (idx 0). Expected: [Shift, Date, Notes].
      // For from > to no shift occurs, so the raw target index is correct.
      const onMoveField = vi.fn();
      renderHeader({ onMoveField });
      dragColumnOnto('sf_3', 'sf_1');
      expect(onMoveField).toHaveBeenCalledTimes(1);
      expect(onMoveField).toHaveBeenCalledWith('sf_3', 0);
    });
  });
});
