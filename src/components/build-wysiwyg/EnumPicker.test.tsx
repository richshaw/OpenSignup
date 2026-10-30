// @vitest-environment jsdom
import { describe, it, expect, vi, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EnumPicker } from './EnumPicker';

function renderPicker(overrides: {
  value?: string;
  options?: string[];
  onChange?: Mock<(next: string) => void>;
  onAddOption?: Mock<(value: string) => void | Promise<void>>;
} = {}) {
  const onChange = overrides.onChange ?? vi.fn<(next: string) => void>();
  const onAddOption = overrides.onAddOption ?? vi.fn<(value: string) => void | Promise<void>>();
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

  it('"+ Add to list" footer reveals an input that commits via Enter', async () => {
    const { onChange, onAddOption } = renderPicker({ options: ['Main'] });
    fireEvent.click(screen.getByRole('button', { name: 'Course value' }));
    fireEvent.click(screen.getByRole('button', { name: /Add to list/ }));
    const input = screen.getByLabelText('New option name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Dessert' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAddOption).toHaveBeenCalledWith('Dessert');
    // onChange fires after awaiting onAddOption — wait one microtask turn.
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('Dessert'));
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

  it('does not double-add when Enter is followed by an unmount blur', async () => {
    const { onChange, onAddOption } = renderPicker({ options: ['Main'] });
    fireEvent.click(screen.getByRole('button', { name: 'Course value' }));
    fireEvent.click(screen.getByRole('button', { name: /Add to list/ }));
    const input = screen.getByLabelText('New option name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Dessert' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // Simulates the blur React fires when the focused input unmounts on close.
    fireEvent.blur(input);
    expect(onAddOption).toHaveBeenCalledTimes(1);
    // onChange fires after awaiting onAddOption — wait one microtask turn.
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
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

  it('a click outside adds the typed choice once, and sets it straight away', () => {
    const { onChange, onAddOption } = renderPicker({ options: ['Main'] });
    fireEvent.click(screen.getByRole('button', { name: 'Course value' }));
    fireEvent.click(screen.getByRole('button', { name: /Add to list/ }));
    const input = screen.getByLabelText('New option name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: ' Dessert ' } });
    fireEvent.mouseDown(document.body);
    // Simulates the blur React fires when the focused input unmounts on close.
    fireEvent.blur(input);
    expect(onAddOption).toHaveBeenCalledTimes(1);
    expect(onAddOption).toHaveBeenCalledWith('Dessert');
    // Not after the field saves: a click on Duplicate must copy the new value.
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('Dessert');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('a click outside with nothing typed closes without adding', () => {
    const { onChange, onAddOption } = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Course value' }));
    fireEvent.click(screen.getByRole('button', { name: /Add to list/ }));
    fireEvent.change(screen.getByLabelText('New option name'), { target: { value: '   ' } });
    fireEvent.mouseDown(document.body);
    expect(onAddOption).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('the Add button adds the typed choice once', () => {
    const { onChange, onAddOption } = renderPicker({ options: ['Main'] });
    fireEvent.click(screen.getByRole('button', { name: 'Course value' }));
    fireEvent.click(screen.getByRole('button', { name: /Add to list/ }));
    const input = screen.getByLabelText('New option name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Dessert' } });
    const add = screen.getByRole('button', { name: 'Add' });
    // The button keeps focus in the box, so its mousedown is not a blur.
    expect(fireEvent.mouseDown(add)).toBe(false);
    fireEvent.click(add);
    fireEvent.blur(input);
    expect(onAddOption).toHaveBeenCalledTimes(1);
    expect(onAddOption).toHaveBeenCalledWith('Dessert');
    expect(onChange).toHaveBeenCalledWith('Dessert');
  });

  it('a click outside with the menu open but not adding just closes it', () => {
    const { onChange, onAddOption } = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: 'Course value' }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onAddOption).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
