// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ShareButton } from '@/components/signup/ShareButton';
import { ShareScope } from '@/components/signup/ShareScope';
import { loadSharePanel } from './load-share-panel';
import { ShareUnavailable } from './ShareUnavailable';

// The panel's chunk can't be fetched: a weak signal, or a tab left open
// across an update.
vi.mock('./SharePanel', () => {
  throw new Error('Loading chunk failed');
});

const LINK = 'https://your-site.example/s/bake-sale-k3x';
const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  window.matchMedia = (query: string) =>
    ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList;
});

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('when the share panel can’t load', () => {
  it('the loader answers with the fallback instead of failing', async () => {
    await expect(loadSharePanel()).resolves.toBe(ShareUnavailable);
  });

  it('the panel still opens, with the link, Copy link and what to do', async () => {
    render(
      <ShareScope publishAction={async () => null} title="Bake sale" url={LINK} message="">
        <ShareButton variant="desktop" />
      </ShareScope>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    const panel = screen.getByRole('dialog', { name: 'Share the link' });
    expect(
      await within(panel).findByText('Couldn’t load the other ways to share. Reload to try again.'),
    ).toBeInTheDocument();
    expect(within(panel).getByLabelText('Public link')).toHaveValue(LINK);
    const copy = within(panel).getByRole('button', { name: 'Copy link' });
    expect(copy).toHaveFocus();
    fireEvent.click(copy);
    await within(panel).findByText('Link copied');
    expect(writeText).toHaveBeenCalledWith(LINK);
  });

  it('says so when the clipboard refuses, and selects the link', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    render(<ShareUnavailable url={LINK} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await screen.findByText('Couldn’t copy. Select the link and copy it.');
    const field = screen.getByLabelText<HTMLInputElement>('Public link');
    expect(field).toHaveFocus();
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, LINK.length]);
  });
});
