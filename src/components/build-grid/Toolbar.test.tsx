// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Toolbar } from './Toolbar';
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
    name: 'Station',
    type: 'enum',
    config: { fieldType: 'enum', choices: ['A', 'B'] },
    sortOrder: 1,
  },
];

describe('<Toolbar />', () => {
  it('does not render an "Add column" or "Add field" button (single CTA now lives in the header)', () => {
    render(
      <Toolbar
        fields={sampleFields}
        rows={[]}
        groupByFieldRef={null}
        onGroupByChange={() => {}}
        showPreview={false}
        onTogglePreview={() => {}}
        saveStatus="idle"
      />,
    );

    expect(screen.queryByRole('button', { name: /add (field|column)/i })).toBeNull();
  });

  it('still renders Group by and Live preview controls', () => {
    render(
      <Toolbar
        fields={sampleFields}
        rows={[]}
        groupByFieldRef={null}
        onGroupByChange={() => {}}
        showPreview={false}
        onTogglePreview={() => {}}
        saveStatus="idle"
      />,
    );

    expect(screen.getByText('Group by')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show live preview' })).toBeInTheDocument();
  });

  it('offers enum (list) fields in the Group-by menu', () => {
    render(
      <Toolbar
        fields={sampleFields}
        rows={[]}
        groupByFieldRef={null}
        onGroupByChange={() => {}}
        showPreview={false}
        onTogglePreview={() => {}}
        saveStatus="idle"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'None' }));

    expect(screen.getByRole('menuitemradio', { name: /Station/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: /Date/ })).toBeInTheDocument();
  });
});
