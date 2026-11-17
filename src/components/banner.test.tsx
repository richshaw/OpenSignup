// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Banner } from './banner';

afterEach(cleanup);

describe('Banner', () => {
  it('names its ✕ with the label it’s given', () => {
    const onDismiss = vi.fn();
    render(
      <Banner
        kind="closed"
        title="Stängd"
        body="Ingen ny kan anmäla sig."
        onDismiss={onDismiss}
        dismissLabel="Stäng meddelandet"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Stäng meddelandet' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('has no ✕ when it can’t be dismissed', () => {
    render(<Banner kind="preview" title="Preview" body="Only you can see this." />);
    expect(screen.getByRole('status')).toHaveTextContent('Only you can see this.');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('needs a label for the ✕ whenever it has one', () => {
    // A type check: tsc fails this file if the label becomes optional.
    // @ts-expect-error onDismiss without dismissLabel
    const unnamed = <Banner kind="closed" title="Closed" body="" onDismiss={() => {}} />;
    expect(unnamed).toBeTruthy();
  });
});
