// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GridBody } from './GridBody';
import type { GridField, GridRow } from './useGridState';

const fields: GridField[] = [
  {
    id: 'sf_1',
    ref: 'r1',
    name: 'Date',
    type: 'date',
    config: { fieldType: 'date' },
    sortOrder: 0,
  },
];

const rows: GridRow[] = [
  { id: 'row1', capacity: null, sortOrder: 0, values: { r1: '2026-05-18' } },
  { id: 'row2', capacity: null, sortOrder: 1, values: { r1: '2026-05-19' } },
  { id: 'row3', capacity: null, sortOrder: 2, values: { r1: '2026-05-20' } },
];

function renderBody(overrides: Partial<React.ComponentProps<typeof GridBody>> = {}) {
  return render(
    <GridBody
      fields={fields}
      rows={rows}
      highlightedRowIdx={-1}
      onSelectRow={vi.fn()}
      onEditCell={vi.fn()}
      onSetCapacity={vi.fn()}
      onDeleteRow={vi.fn()}
      onMoveRow={vi.fn()}
      onMoveRowUp={vi.fn()}
      onMoveRowDown={vi.fn()}
      {...overrides}
    />,
  );
}

describe('<GridBody />', () => {
  it('renders a draggable # cell per row with descriptive aria-label', () => {
    renderBody();
    const handles = screen.getAllByRole('button', { name: /Drag or use Cmd\/Ctrl \+ Up\/Down to reorder slot/i });
    expect(handles).toHaveLength(3);
    handles.forEach((h) => expect(h).toHaveAttribute('draggable', 'true'));
  });

  it('does NOT render Move-up / Move-down chevron buttons in the trailing cell', () => {
    renderBody();
    expect(screen.queryByRole('button', { name: /move row up/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /move row down/i })).toBeNull();
  });

  it('renders exactly one always-visible Remove slot button per row in the trailing cell', () => {
    renderBody();
    const removes = screen.getAllByRole('button', { name: /remove slot/i });
    expect(removes).toHaveLength(3);
  });

  it('Cmd/Ctrl + ArrowDown on the # cell calls onMoveRowDown with the row id', () => {
    const onMoveRowDown = vi.fn();
    renderBody({ onMoveRowDown });
    const handle1 = screen.getByRole('button', { name: /reorder slot 1/i });
    fireEvent.keyDown(handle1, { key: 'ArrowDown', metaKey: true });
    expect(onMoveRowDown).toHaveBeenCalledTimes(1);
    expect(onMoveRowDown).toHaveBeenCalledWith('row1');
  });

  it('Cmd/Ctrl + ArrowUp on the # cell calls onMoveRowUp with the row id', () => {
    const onMoveRowUp = vi.fn();
    renderBody({ onMoveRowUp });
    const handle2 = screen.getByRole('button', { name: /reorder slot 2/i });
    fireEvent.keyDown(handle2, { key: 'ArrowUp', ctrlKey: true });
    expect(onMoveRowUp).toHaveBeenCalledTimes(1);
    expect(onMoveRowUp).toHaveBeenCalledWith('row2');
  });

  it('Cmd/Ctrl + ArrowUp on the first row is a no-op', () => {
    const onMoveRowUp = vi.fn();
    renderBody({ onMoveRowUp });
    const handle1 = screen.getByRole('button', { name: /reorder slot 1/i });
    fireEvent.keyDown(handle1, { key: 'ArrowUp', metaKey: true });
    expect(onMoveRowUp).not.toHaveBeenCalled();
  });

  it('Cmd/Ctrl + ArrowDown on the last row is a no-op', () => {
    const onMoveRowDown = vi.fn();
    renderBody({ onMoveRowDown });
    const handle3 = screen.getByRole('button', { name: /reorder slot 3/i });
    fireEvent.keyDown(handle3, { key: 'ArrowDown', metaKey: true });
    expect(onMoveRowDown).not.toHaveBeenCalled();
  });

  it('plain Arrow keys without Cmd/Ctrl do not trigger reorder', () => {
    const onMoveRowUp = vi.fn();
    const onMoveRowDown = vi.fn();
    renderBody({ onMoveRowUp, onMoveRowDown });
    const handle2 = screen.getByRole('button', { name: /reorder slot 2/i });
    fireEvent.keyDown(handle2, { key: 'ArrowUp' });
    fireEvent.keyDown(handle2, { key: 'ArrowDown' });
    expect(onMoveRowUp).not.toHaveBeenCalled();
    expect(onMoveRowDown).not.toHaveBeenCalled();
  });

  it('clicking the X delete fires onDeleteRow without bubbling row select', () => {
    const onDeleteRow = vi.fn();
    const onSelectRow = vi.fn();
    renderBody({ onDeleteRow, onSelectRow });
    const removes = screen.getAllByRole('button', { name: /remove slot/i });
    removes[0]!.click();
    expect(onDeleteRow).toHaveBeenCalledTimes(1);
    expect(onDeleteRow).toHaveBeenCalledWith('row1');
    expect(onSelectRow).not.toHaveBeenCalled();
  });

  it('clicking the # drag handle does NOT trigger row select', () => {
    const onSelectRow = vi.fn();
    renderBody({ onSelectRow });
    screen.getByRole('button', { name: /reorder slot 1/i }).click();
    expect(onSelectRow).not.toHaveBeenCalled();
  });

  it('keyboard reorder announces via onAnnounce', () => {
    const onAnnounce = vi.fn();
    renderBody({ onAnnounce });
    const handle1 = screen.getByRole('button', { name: /reorder slot 1/i });
    fireEvent.keyDown(handle1, { key: 'ArrowDown', metaKey: true });
    expect(onAnnounce).toHaveBeenCalledTimes(1);
    expect(onAnnounce).toHaveBeenCalledWith(expect.stringMatching(/Moved slot to position 2 of 3/));
  });
});
