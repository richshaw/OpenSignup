// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { GroupedBody } from './GroupedBody';
import type { GridField, GridRow } from './useGridState';

const dateField: GridField = {
  id: 'sf_date',
  ref: 'date',
  name: 'Date',
  type: 'date',
  config: { fieldType: 'date' },
  sortOrder: 0,
};

const textField: GridField = {
  id: 'sf_notes',
  ref: 'notes',
  name: 'Notes',
  type: 'text',
  config: { fieldType: 'text', maxLength: 200 },
  sortOrder: 1,
};

const fields: GridField[] = [dateField, textField];

function row(id: string, sortOrder: number, values: Record<string, string>): GridRow {
  return { id, capacity: null, sortOrder, values };
}

const baseHandlers = {
  onSelectRow: vi.fn(),
  onEditCell: vi.fn(),
  onSetCapacity: vi.fn(),
  onDeleteRow: vi.fn(),
  onMoveRowUp: vi.fn(),
  onMoveRowDown: vi.fn(),
};

describe('<GroupedBody />', () => {
  it('delegates to flat <GridBody /> when groupByFieldRef is null', () => {
    const rows = [
      row('r1', 0, { date: '2026-05-18', notes: 'first' }),
      row('r2', 1, { date: '2026-05-19', notes: 'second' }),
    ];
    render(
      <GroupedBody
        fields={fields}
        rows={rows}
        groupByFieldRef={null}
        highlightedRowIdx={-1}
        {...baseHandlers}
      />,
    );

    expect(screen.queryByRole('button', { name: /No value/i })).toBeNull();
    // Both date cells render — flat passthrough.
    expect(screen.getByDisplayValue('2026-05-18')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-05-19')).toBeInTheDocument();
  });

  it('renders one header per unique date value plus a "No value" header for empty rows', () => {
    const rows = [
      row('r1', 0, { date: '2026-05-18', notes: 'a' }),
      row('r2', 1, { date: '2026-05-19', notes: 'b' }),
      row('r3', 2, { date: '2026-05-18', notes: 'c' }), // duplicate date → same group
      row('r4', 3, { date: '', notes: 'd' }), // empty → No value
    ];

    render(
      <GroupedBody
        fields={fields}
        rows={rows}
        groupByFieldRef="date"
        highlightedRowIdx={-1}
        {...baseHandlers}
      />,
    );

    // Two real date groups (deduped) + one "No value" group.
    const headers = screen.getAllByRole('button', { expanded: true });
    expect(headers).toHaveLength(3);

    // Date headers carry localised "Mon, May 18" style labels.
    expect(screen.getByRole('button', { name: /May 18/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /May 19/ })).toBeInTheDocument();
    // Empty-bucket header.
    expect(screen.getByRole('button', { name: /No value/ })).toBeInTheDocument();

    // Slot counts: May 18 has 2, May 19 has 1, No value has 1.
    expect(screen.getByRole('button', { name: /May 18.*2 slots/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /May 19.*1 slot$/ })).toBeInTheDocument();
  });

  it('pins the "No value" header last in the rendered order', () => {
    const rows = [
      row('r1', 0, { date: '', notes: 'a' }),
      row('r2', 1, { date: '2026-05-19', notes: 'b' }),
      row('r3', 2, { date: '2026-05-18', notes: 'c' }),
    ];
    render(
      <GroupedBody
        fields={fields}
        rows={rows}
        groupByFieldRef="date"
        highlightedRowIdx={-1}
        {...baseHandlers}
      />,
    );

    const headers = screen.getAllByRole('button', { expanded: true });
    expect(headers).toHaveLength(3);
    // Order: 2026-05-18, 2026-05-19, No value.
    expect(headers[0]).toHaveTextContent(/May 18/);
    expect(headers[1]).toHaveTextContent(/May 19/);
    expect(headers[2]).toHaveTextContent(/No value/);
  });

  it('collapses a group when its header is clicked', async () => {
    const rows = [
      row('r1', 0, { date: '2026-05-18', notes: 'a' }),
      row('r2', 1, { date: '2026-05-19', notes: 'b' }),
    ];
    render(
      <GroupedBody
        fields={fields}
        rows={rows}
        groupByFieldRef="date"
        highlightedRowIdx={-1}
        {...baseHandlers}
      />,
    );

    expect(screen.getByDisplayValue('2026-05-18')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-05-19')).toBeInTheDocument();

    const may18Header = screen.getByRole('button', { name: /May 18/ });
    act(() => may18Header.click());

    // The collapsed group's date input is gone; the other one remains.
    expect(screen.queryByDisplayValue('2026-05-18')).toBeNull();
    expect(screen.getByDisplayValue('2026-05-19')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /May 18/, expanded: false })).toBeInTheDocument();
  });

  it('resets collapsed groups when groupByFieldRef changes', () => {
    const rows = [
      row('r1', 0, { date: '2026-05-18', notes: 'alpha' }),
      row('r2', 1, { date: '2026-05-19', notes: 'beta' }),
    ];
    const { rerender } = render(
      <GroupedBody
        fields={fields}
        rows={rows}
        groupByFieldRef="date"
        highlightedRowIdx={-1}
        {...baseHandlers}
      />,
    );
    act(() => screen.getByRole('button', { name: /May 18/ }).click());
    expect(screen.queryByDisplayValue('2026-05-18')).toBeNull();

    // Switch to notes — the new groups should all be expanded.
    rerender(
      <GroupedBody
        fields={fields}
        rows={rows}
        groupByFieldRef="notes"
        highlightedRowIdx={-1}
        {...baseHandlers}
      />,
    );

    const alphaGroup = screen.getByRole('button', { name: /^alpha/i });
    const betaGroup = screen.getByRole('button', { name: /^beta/i });
    expect(alphaGroup).toHaveAttribute('aria-expanded', 'true');
    expect(betaGroup).toHaveAttribute('aria-expanded', 'true');
    // Body rows are visible again.
    expect(screen.getByDisplayValue('alpha')).toBeInTheDocument();
    expect(screen.getByDisplayValue('beta')).toBeInTheDocument();
  });

  it('translates a per-group row click to the flat sortOrder index via onSelectRow', () => {
    const onSelectRow = vi.fn();
    const rows = [
      row('r1', 0, { date: '2026-05-19', notes: 'a' }),
      row('r2', 1, { date: '2026-05-18', notes: 'b' }),
      row('r3', 2, { date: '2026-05-19', notes: 'c' }),
    ];
    render(
      <GroupedBody
        fields={fields}
        rows={rows}
        groupByFieldRef="date"
        highlightedRowIdx={-1}
        {...baseHandlers}
        onSelectRow={onSelectRow}
      />,
    );

    // The May 18 group has one row (r2 — flat index 1). Click that row.
    const may18Body = screen.getByDisplayValue('2026-05-18').closest('.group') as HTMLElement;
    expect(may18Body).not.toBeNull();
    act(() => may18Body.click());
    expect(onSelectRow).toHaveBeenCalledWith(1);
  });
});
