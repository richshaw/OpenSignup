// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FieldEditor } from './FieldEditor';
import type { GridField } from './useGridState';

const noop = () => {};

const sampleField: GridField = {
  id: 'sf_1',
  ref: 'r1',
  name: 'Date',
  type: 'date',
  config: { fieldType: 'date' },
  sortOrder: 0,
};

describe('<FieldEditor />', () => {
  it('shows "New field" when creating', () => {
    render(<FieldEditor editorMode={{ mode: 'create' }} onSave={noop} onClose={noop} />);
    expect(screen.getByRole('heading', { name: 'New field' })).toBeInTheDocument();
    expect(screen.queryByText(/column/i)).toBeNull();
  });

  it('shows "Edit field" + "Remove field" when editing', () => {
    render(
      <FieldEditor
        editorMode={{ mode: 'edit', field: sampleField }}
        onSave={noop}
        onDelete={vi.fn()}
        onClose={noop}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Edit field' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove field' })).toBeInTheDocument();
    expect(screen.queryByText(/column/i)).toBeNull();
  });
});
