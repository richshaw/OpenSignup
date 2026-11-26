// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ShareButton } from '@/components/signup/ShareButton';
import { ShareScope } from '@/components/signup/ShareScope';
import { TEST_LOCALES } from '@/i18n/testing/locales';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import { loadSharePanel } from './load-share-panel';
import { ShareUnavailable } from './ShareUnavailable';
import { shareText } from './share-text';

// The panel's chunk can't be fetched: a weak signal, or a tab left open
// across an update.
const emit = vi.hoisted(() => vi.fn());
vi.mock('@/lib/signup-link-events', () => ({ emitSignupLinkEvent: emit }));
vi.mock('./SharePanel', () => {
  throw new Error('Loading chunk failed');
});

/** The share panel's words in English, as `SignupHeader` passes them. */
const SHARE_TEXT = shareText(getTestTranslator('organizer.share'), 'Bake sale helpers');

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
        text={SHARE_TEXT}
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
      await within(panel).findByText("Couldn't load the other ways to share. Reload to try again."),
    ).toBeInTheDocument();
    expect(within(panel).getByText(LINK)).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Copy public link' }));
    await within(panel).findByText('Link copied');
    expect(writeText).toHaveBeenCalledWith(LINK);
    // The panel's copy, not the header's.
    expect(emit).toHaveBeenCalledExactlyOnceWith('sig_1', 'copied', 'share_panel');
    expect(within(panel).getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('a load that failed ahead isn’t kept, so opening the panel tries again', async () => {
    vi.resetModules();
    const fresh = await import('./load-share-panel');
    const { ShareScope: Scope } = await import('@/components/signup/ShareScope');
    const { ShareButton: Share } = await import('@/components/signup/ShareButton');
    await fresh.loadSharePanel();
    render(
      <Scope
        text={SHARE_TEXT}
        publishAction={async () => null}
        signupId="sig_1"
        title="Bake sale"
        url={LINK}
        message=""
      >
        <Share variant="desktop" />
      </Scope>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    const panel = screen.getByRole('dialog', { name: 'Share the link' });
    // Not answered at once from the failed load: the fallback shows while it
    // asks again.
    const failed = "Couldn't load the other ways to share. Reload to try again.";
    expect(within(panel).queryByText(failed)).toBeNull();
    expect(await within(panel).findByText(failed)).toBeInTheDocument();
  });
});

describe.each(TEST_LOCALES)('when the share panel can’t load, in %s', (locale) => {
  it('says so, and names the link’s chip, from the catalog in that language', async () => {
    const text = shareText(getStandInTranslator(locale, 'organizer.share'), 'Bake sale');
    const words = (key: string) => `organizer.share.${key} in ${locale}`;
    render(<ShareUnavailable text={text.panel} signupId="sig_1" url={LINK} />);
    expect(screen.getByText(words('unavailable'))).toBeInTheDocument();
    expect(screen.getByText(words('chip.label'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: words('chip.copy') }));
    expect(await screen.findByText(words('chip.copied'))).toBeInTheDocument();
  });
});
