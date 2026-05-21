// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EnumPicker } from './EnumPicker';

function renderPicker(overrides: {
  value?: string;
  options?: string[];
  onChange?: ReturnType<typeof vi.fn>;
  onAddOption?: ReturnType<typeof vi.fn>;
} = {}) {
  const onChange = overrides.onChange ?? vi.fn();
  const onAddOption = overrides.onAddOption ?? vi.fn();
  const utils = render(
    <EnumPicker
      value={overrides.value ?? ''}
      options={overrides.options ?? ['Main', 'Side']}
      ariaLabel="Course value"
      onChange={onChange}
      onAddOption={onAddOption}
    />,
  );
  return { ...utils, onChange, onAddOption };
}

describe('EnumPicker', () => {
  it('renders a "Choose…" placeholder when value is empty', () => {
    renderPicker();
    expect(screen.getByRole('button', { name: 'Course value' }).textContent).toContain('Choose');
  });

  it('renders the value when set', () => {
    renderPicker({ value: 'Main' });
    expect(screen.getByRole('button', { name: 'Course value' }).textContent).toContain('Main');
  });

  it('opening the menu lists every option', () => {
    renderPicker({ options: ['A', 'B', 'C'] });
    fireEvent.click(screen.getByRole('button', { name: 'Course value' }));
    const listbox = screen.getByRole('listbox', { name: 'Course value' });
    const opts = listbox.querySelectorAll('[role="option"]');
    expect(opts).toHaveLength(3);
    expect(Array.from(opts).map((o) => o.textContent?.trim())).toEqual(['A', 'B', 'C']);
  });

  it('selecting an option calls onChange and closes the menu', () => {
    const { onChange } = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Course value' }));
    fireEvent.click(screen.getByRole('option', { name: 'Main' }));
    expect(onChange).toHaveBeenCalledWith('Main');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('"+ Add to list" footer reveals an input that commits via Enter', () => {
    const { onChange, onAddOption } = renderPicker({ options: ['Main'] });
    fireEvent.click(screen.getByRole('button', { name: 'Course value' }));
    fireEvent.click(screen.getByRole('button', { name: /Add to list/ }));
    const input = screen.getByLabelText('New option name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Dessert' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAddOption).toHaveBeenCalledWith('Dessert');
    expect(onChange).toHaveBeenCalledWith('Dessert');
  });

  it('Escape inside the add-input cancels without saving', () => {
    const { onChange, onAddOption } = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Course value' }));
    fireEvent.click(screen.getByRole('button', { name: /Add to list/ }));
    const input = screen.getByLabelText('New option name');
    fireEvent.change(input, { target: { value: 'Dessert' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onAddOption).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('empty options list shows the "No items yet" hint', () => {
    renderPicker({ options: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Course value' }));
    expect(screen.getByText('No items yet.')).toBeTruthy();
  });

  it('blank add-input commits as a no-op (does not add empty option)', () => {
    const { onChange, onAddOption } = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Course value' }));
    fireEvent.click(screen.getByRole('button', { name: /Add to list/ }));
    fireEvent.keyDown(screen.getByLabelText('New option name'), { key: 'Enter' });
    expect(onAddOption).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not double-add when Enter is followed by an unmount blur', () => {
    const { onChange, onAddOption } = renderPicker({ options: ['Main'] });
    fireEvent.click(screen.getByRole('button', { name: 'Course value' }));
    fireEvent.click(screen.getByRole('button', { name: /Add to list/ }));
    const input = screen.getByLabelText('New option name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Dessert' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // Simulates the blur React fires when the focused input unmounts on close.
    fireEvent.blur(input);
    expect(onAddOption).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('does not add when Escape is followed by an unmount blur', () => {
    const { onChange, onAddOption } = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Course value' }));
    fireEvent.click(screen.getByRole('button', { name: /Add to list/ }));
    const input = screen.getByLabelText('New option name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Dessert' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.blur(input);
    expect(onAddOption).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
