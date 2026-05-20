// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Editable } from './Editable';

function renderEditable(props: Partial<React.ComponentProps<typeof Editable>> = {}) {
  const onChange = vi.fn();
  const finalProps: React.ComponentProps<typeof Editable> = {
    value: 'hello',
    onChange,
    placeholder: 'placeholder',
    multiline: false,
    ariaLabel: 'Editable',
    ...props,
  };
  const utils = render(<Editable {...finalProps} />);
  return { ...utils, onChange: finalProps.onChange };
}

describe('Editable', () => {
  it('renders the value with role="button" when not editing', () => {
    renderEditable({ value: 'hello' });
    const btn = screen.getByRole('button', { name: 'Editable' });
    expect(btn).toBeTruthy();
    expect(btn.textContent).toBe('hello');
  });

  it('renders placeholder when value is empty', () => {
    renderEditable({ value: '', placeholder: 'Type something' });
    expect(screen.getByText('Type something')).toBeTruthy();
  });

  it('enters edit mode on click', () => {
    renderEditable({ value: 'hello' });
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  it('enters edit mode on Enter', () => {
    renderEditable({ value: 'hello' });
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  it('enters edit mode on Space', () => {
    renderEditable({ value: 'hello' });
    fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });
    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  it('commits on Enter (single line)', () => {
    const { onChange } = renderEditable({ value: 'hello' });
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'world' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('world');
  });

  it('commits on blur', () => {
    const { onChange } = renderEditable({ value: 'hello' });
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'world' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('world');
  });

  it('does not call onChange on blur if value is unchanged', () => {
    const { onChange } = renderEditable({ value: 'hello' });
    fireEvent.click(screen.getByRole('button'));
    fireEvent.blur(screen.getByRole('textbox'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('discards edit on Escape', () => {
    const { onChange } = renderEditable({ value: 'hello' });
    fireEvent.click(screen.getByRole('button'));
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'world' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onChange).not.toHaveBeenCalled();
    // Re-rendered as the static span
    expect(screen.getByRole('button').textContent).toBe('hello');
  });

  it('renders display string when supplied', () => {
    renderEditable({ value: '05/21/2026', display: 'THU, MAY 21' });
    const btn = screen.getByRole('button');
    expect(btn.textContent).toBe('THU, MAY 21');
  });

  it('multiline renders a textarea on edit', () => {
    renderEditable({ value: 'line1', multiline: true });
    fireEvent.click(screen.getByRole('button'));
    const ta = screen.getByRole('textbox');
    expect(ta.tagName).toBe('TEXTAREA');
  });
});
