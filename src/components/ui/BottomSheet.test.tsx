// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { BottomSheet } from './BottomSheet';

afterEach(cleanup);

describe('BottomSheet', () => {
  it('names its close ✕ with the label it’s given', () => {
    const onClose = vi.fn();
    render(
      <BottomSheet open onClose={onClose} title="Kakor" closeLabel="Stäng">
        <p>Ta med något sött.</p>
      </BottomSheet>,
    );
    expect(screen.getByRole('dialog', { name: 'Kakor' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stäng' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
