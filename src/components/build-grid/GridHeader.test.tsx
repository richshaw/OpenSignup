// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
