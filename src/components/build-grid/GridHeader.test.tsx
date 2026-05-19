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
      onDeleteField={vi.fn()}
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
});
