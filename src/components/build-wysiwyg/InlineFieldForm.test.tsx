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
        reminderFieldRef={null}
        reminderFieldLabel={null}
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
        reminderFieldRef={null}
        reminderFieldLabel={null}
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
        reminderFieldRef={null}
        reminderFieldLabel={null}
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
        reminderFieldRef={null}
        reminderFieldLabel={null}
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
        reminderFieldRef={null}
        reminderFieldLabel={null}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByLabelText('Field name');
    fireEvent.change(input, { target: { value: '  Teacher  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add field' }));
    expect(onSave).toHaveBeenCalledWith({
      name: 'Teacher',
      config: { fieldType: 'enum', choices: ['Option 1'] },
    });
  });

  it('falls back to "Untitled" when the name is empty', () => {
    const onSave = vi.fn();
    render(
      <InlineFieldForm
        formMode={{ mode: 'create' }}
        reminderFieldRef={null}
        reminderFieldLabel={null}
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
        reminderFieldRef={null}
        reminderFieldLabel={null}
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
        reminderFieldRef={null}
        reminderFieldLabel={null}
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
        reminderFieldRef={null}
        reminderFieldLabel={null}
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
    const field = makeField({ name: 'Subject', config: { fieldType: 'date' } });
    render(
      <InlineFieldForm
        formMode={{ mode: 'edit', field }}
        reminderFieldRef={null}
        reminderFieldLabel={null}
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
        reminderFieldRef={null}
        reminderFieldLabel={null}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Remove field' })).toBeTruthy();
  });

  it('preserves enum choices when saving an edit that does not change the type', () => {
    const field = makeField({
      name: 'Course',
      config: { fieldType: 'enum', choices: ['Main', 'Side', 'Drink'] },
    });
    const onSave = vi.fn();
    render(
      <InlineFieldForm
        formMode={{ mode: 'edit', field }}
        reminderFieldRef={null}
        reminderFieldLabel={null}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({
      name: 'Course',
      config: { fieldType: 'enum', choices: ['Main', 'Side', 'Drink'] },
    });
  });

  it('Remove field button calls onDelete', () => {
    const onDelete = vi.fn();
    render(
      <InlineFieldForm
        formMode={{ mode: 'edit', field: makeField() }}
        reminderFieldRef={null}
        reminderFieldLabel={null}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove field' }));
    expect(onDelete).toHaveBeenCalled();
  });
});

describe('InlineFieldForm — reminder checkbox', () => {
  const CHECKBOX = 'Send a reminder email before this date';
  const dateField = makeField({ id: 'f-date', ref: 'date', name: 'Date', config: { fieldType: 'date' } });

  function renderEdit(
    field: GridField,
    reminder: { ref: string | null; label: string | null },
    onSave = vi.fn(),
  ) {
    render(
      <InlineFieldForm
        formMode={{ mode: 'edit', field }}
        reminderFieldRef={reminder.ref}
        reminderFieldLabel={reminder.label}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );
    return onSave;
  }

  it('is checked and enabled when editing the reminder field', () => {
    renderEdit(dateField, { ref: 'date', label: 'Date' });
    const box = screen.getByRole('checkbox', { name: CHECKBOX }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(false);
    expect(screen.getByText(/Sent the day before\./)).toBeTruthy();
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('is unchecked and enabled for a date field when no field holds the reminder', () => {
    renderEdit(dateField, { ref: null, label: null });
    const box = screen.getByRole('checkbox', { name: CHECKBOX }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(box.disabled).toBe(false);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('is disabled, drops the helper and names the other field when one already holds the reminder', () => {
    const setupDay = makeField({ id: 'f-setup', ref: 'setup-day', name: 'Setup day', config: { fieldType: 'date' } });
    renderEdit(setupDay, { ref: 'date', label: 'Date' });
    const box = screen.getByRole('checkbox', { name: CHECKBOX }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(box.disabled).toBe(true);
    expect(screen.queryByText(/Sent the day before\./)).toBeNull();
    const note = screen.getByRole('note');
    expect(note.textContent).toBe(
      'Date is already the reminder field for this signup. Turn it off there to use this one instead.',
    );
    expect(note.querySelector('strong')?.textContent).toBe('Date');
  });

  it('is not rendered for a non-date field', () => {
    renderEdit(makeField({ config: { fieldType: 'text', maxLength: 200 } }), { ref: 'date', label: 'Date' });
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('is not rendered in create mode', () => {
    render(
      <InlineFieldForm
        formMode={{ mode: 'create' }}
        reminderFieldRef={null}
        reminderFieldLabel={null}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Date' }));
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('appears once an existing field is switched to Date', () => {
    renderEdit(makeField({ config: { fieldType: 'text', maxLength: 200 } }), { ref: null, label: null });
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Date' }));
    expect(screen.getByRole('checkbox', { name: CHECKBOX })).toBeTruthy();
  });

  it('saves reminder: true after ticking', () => {
    const onSave = renderEdit(dateField, { ref: null, label: null });
    fireEvent.click(screen.getByRole('checkbox', { name: CHECKBOX }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ name: 'Date', config: { fieldType: 'date' }, reminder: true });
  });

  it('saves reminder: false after unticking the reminder field', () => {
    const onSave = renderEdit(dateField, { ref: 'date', label: 'Date' });
    fireEvent.click(screen.getByRole('checkbox', { name: CHECKBOX }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ name: 'Date', config: { fieldType: 'date' }, reminder: false });
  });

  it('saves without a reminder key for a non-date field', () => {
    const onSave = renderEdit(makeField(), { ref: 'date', label: 'Date' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ name: 'Name', config: { fieldType: 'text', maxLength: 200 } });
    expect(onSave.mock.calls[0]![0]).not.toHaveProperty('reminder');
  });
});
