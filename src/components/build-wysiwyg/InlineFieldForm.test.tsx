// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InlineFieldForm } from './InlineFieldForm';
import type { GridField } from '../build-grid/useGridState';

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

describe('InlineFieldForm — create mode', () => {
  it('focuses the name input on mount', () => {
    render(
      <InlineFieldForm
        formMode={{ mode: 'create' }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByLabelText('Field name') as HTMLInputElement;
    expect(document.activeElement).toBe(input);
  });

  it('renders a Back button (parent modal title provides the heading)', () => {
    render(
      <InlineFieldForm
        formMode={{ mode: 'create' }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Back to fields list' })).toBeTruthy();
  });

  it('does not render a delete affordance', () => {
    render(
      <InlineFieldForm
        formMode={{ mode: 'create' }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByText('Remove field')).toBeNull();
  });

  it('toggles type via the type buttons', () => {
    render(
      <InlineFieldForm
        formMode={{ mode: 'create' }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const enumBtn = screen.getByRole('button', { name: 'List' });
    fireEvent.click(enumBtn);
    expect(enumBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('saves with trimmed name and the selected type config', () => {
    const onSave = vi.fn();
    render(
      <InlineFieldForm
        formMode={{ mode: 'create' }}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByLabelText('Field name');
    fireEvent.change(input, { target: { value: '  Teacher  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
    expect(onSave).toHaveBeenCalledWith({
      type: 'enum',
      name: 'Teacher',
      config: { fieldType: 'enum', choices: [] },
    });
  });

  it('falls back to "Untitled" when the name is empty', () => {
    const onSave = vi.fn();
    render(
      <InlineFieldForm
        formMode={{ mode: 'create' }}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
    expect(onSave.mock.calls[0]![0].name).toBe('Untitled');
  });

  it('Enter commits the form', () => {
    const onSave = vi.fn();
    render(
      <InlineFieldForm
        formMode={{ mode: 'create' }}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByLabelText('Field name');
    fireEvent.change(input, { target: { value: 'Subject' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSave).toHaveBeenCalled();
  });

  it('Escape cancels without saving', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(
      <InlineFieldForm
        formMode={{ mode: 'create' }}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(screen.getByLabelText('Field name'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('Cancel button calls onCancel', () => {
    const onCancel = vi.fn();
    render(
      <InlineFieldForm
        formMode={{ mode: 'create' }}
        onSave={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('InlineFieldForm — edit mode', () => {
  it('seeds name and type from the existing field', () => {
    const field = makeField({ name: 'Subject', type: 'date' });
    render(
      <InlineFieldForm
        formMode={{ mode: 'edit', field }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByLabelText('Field name') as HTMLInputElement;
    expect(input.value).toBe('Subject');
    expect(screen.getByRole('button', { name: 'Date' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('renders a delete affordance', () => {
    const field = makeField();
    render(
      <InlineFieldForm
        formMode={{ mode: 'edit', field }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Remove field' })).toBeTruthy();
  });

  it('preserves enum choices when saving an edit that does not change the type', () => {
    const field = makeField({
      type: 'enum',
      name: 'Course',
      config: { fieldType: 'enum', choices: ['Main', 'Side', 'Drink'] },
    });
    const onSave = vi.fn();
    render(
      <InlineFieldForm
        formMode={{ mode: 'edit', field }}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({
      type: 'enum',
      name: 'Course',
      config: { fieldType: 'enum', choices: ['Main', 'Side', 'Drink'] },
    });
  });

  it('Remove field button calls onDelete', () => {
    const onDelete = vi.fn();
    render(
      <InlineFieldForm
        formMode={{ mode: 'edit', field: makeField() }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove field' }));
    expect(onDelete).toHaveBeenCalled();
  });
});
