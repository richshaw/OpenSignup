// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PublicLinkChip } from './PublicLinkChip';

const emit = vi.hoisted(() => vi.fn());
vi.mock('@/lib/signup-link-events', () => ({ emitSignupLinkEvent: emit }));

const LINK = 'https://your-site.example/s/bake-sale-k3x';
const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  emit.mockClear();
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

describe('PublicLinkChip', () => {
  it('records a copy from the header once the clipboard has it', async () => {
    render(<PublicLinkChip url={LINK} signupId="sig_1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy public link' }));
    await screen.findByText('Link copied');
    expect(writeText).toHaveBeenCalledWith(LINK);
    expect(emit).toHaveBeenCalledExactlyOnceWith('sig_1', 'copied', 'header');
  });

  it('records it as the share panel’s where the panel shows it', async () => {
    render(<PublicLinkChip url={LINK} signupId="sig_1" surface="share_panel" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy public link' }));
    await screen.findByText('Link copied');
    expect(emit).toHaveBeenCalledExactlyOnceWith('sig_1', 'copied', 'share_panel');
  });

  it('records nothing when the clipboard refuses', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    render(<PublicLinkChip url={LINK} signupId="sig_1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy public link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    await Promise.resolve();
    expect(emit).not.toHaveBeenCalled();
  });
});
