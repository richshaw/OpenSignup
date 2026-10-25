// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ShareButton } from '@/components/signup/ShareButton';
import { ShareScope } from '@/components/signup/ShareScope';
import { loadSharePanel } from './load-share-panel';
import { ShareUnavailable } from './ShareUnavailable';

// The panel's chunk can't be fetched: a weak signal, or a tab left open
// across an update.
const emit = vi.hoisted(() => vi.fn());
vi.mock('@/lib/signup-link-events', () => ({ emitSignupLinkEvent: emit }));
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

  it('the panel still opens, with the link, its copy button and what to do', async () => {
    render(
      <ShareScope
        publishAction={async () => null}
        signupId="sig_1"
        title="Bake sale"
        url={LINK}
        message=""
      >
        <ShareButton variant="desktop" />
      </ShareScope>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    const panel = screen.getByRole('dialog', { name: 'Share the link' });
    expect(
      await within(panel).findByText('Couldn’t load the other ways to share. Reload to try again.'),
    ).toBeInTheDocument();
    expect(within(panel).getByText(LINK)).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Copy public link' }));
    await within(panel).findByText('Link copied');
    expect(writeText).toHaveBeenCalledWith(LINK);
    // The panel's copy, not the header's.
    expect(emit).toHaveBeenCalledExactlyOnceWith('sig_1', 'copied', 'share_panel');
    expect(within(panel).getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});
