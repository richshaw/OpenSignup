// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

// The QR code has its own test; here it would only wait on the encoder.
vi.mock('@/components/share/ShareQrCode', () => ({ ShareQrCode: () => null }));
// The real panel, counted, to see when its code is asked for. Mocked afresh
// in each test, since a module mocked once stays loaded through
// `vi.resetModules`.
const panelLoads = { count: 0 };

const LINK = 'https://your-site.example/s/bake-sale-k3x';

/** The browser's idle callbacks, run when the test says the page is idle. */
function idleCallbacks() {
  const waiting = new Map<number, IdleRequestCallback>();
  let next = 1;
  vi.stubGlobal(
    'requestIdleCallback',
    vi.fn((callback: IdleRequestCallback) => {
      waiting.set(next, callback);
      return next++;
    }),
  );
  vi.stubGlobal(
    'cancelIdleCallback',
    vi.fn((id: number) => waiting.delete(id)),
  );
  return {
    waiting,
    run() {
      for (const [id, callback] of waiting) {
        waiting.delete(id);
        callback({ didTimeout: false, timeRemaining: () => 50 });
      }
    },
  };
}

/**
 * Once a load the page started has come in and been kept. The test's own
 * import only waits for the module; it doesn't keep it as the page's load
 * does.
 */
async function panelArrived() {
  await import('./SharePanel');
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function prefetchProbe() {
  const { usePrefetchSharePanel } = await import('./load-share-panel');
  return function Probe() {
    usePrefetchSharePanel();
    return null;
  };
}

/** An open signup's header Share, as SignupHeader lays it out on a computer. */
async function header() {
  const { ShareScope } = await import('@/components/signup/ShareScope');
  const { ShareButton } = await import('@/components/signup/ShareButton');
  render(
    <ShareScope
      publishAction={async () => null}
      signupId="sig_1"
      title="Bake sale helpers"
      url={LINK}
      message={`Bake sale helpers\n8 spots open\nSign up here, no account needed: ${LINK}`}
    >
      <ShareButton variant="desktop" />
    </ShareScope>,
  );
}

beforeEach(() => {
  // Each test starts with the panel's code not loaded yet.
  vi.resetModules();
  panelLoads.count = 0;
  vi.doMock('./SharePanel', async (importOriginal) => {
    panelLoads.count += 1;
    return importOriginal();
  });
  window.matchMedia = (query: string) =>
    ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList;
});

afterEach(() => {
  // Unmounted while the stubs are still there, as a browser keeps them.
  cleanup();
  Reflect.deleteProperty(window, 'matchMedia');
  vi.doUnmock('./SharePanel');
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the share panel’s code, fetched ahead', () => {
  it('is asked for once the page is idle, and not before', async () => {
    const idle = idleCallbacks();
    const Probe = await prefetchProbe();
    render(<Probe />);
    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 2000 });
    expect(panelLoads.count).toBe(0);

    idle.run();
    await vi.waitFor(() => expect(panelLoads.count).toBe(1));
    await panelArrived();
  });

  it('isn’t asked for once the page has gone before it was idle', async () => {
    const idle = idleCallbacks();
    const Probe = await prefetchProbe();
    const { unmount } = render(<Probe />);
    unmount();
    expect(cancelIdleCallback).toHaveBeenCalledWith(1);
    expect(idle.waiting.size).toBe(0);
  });

  it('waits 200 ms instead where there’s no requestIdleCallback (Safari)', async () => {
    vi.stubGlobal('requestIdleCallback', undefined);
    const Probe = await prefetchProbe();
    // Only the timeout: faked, requestIdleCallback would be there again.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    render(<Probe />);
    vi.advanceTimersByTime(199);
    expect(panelLoads.count).toBe(0);
    vi.advanceTimersByTime(1);
    vi.useRealTimers();
    await vi.waitFor(() => expect(panelLoads.count).toBe(1));
    await panelArrived();
  });
});

describe('the first open', () => {
  it('shows the whole panel at once when its code came in ahead', async () => {
    const idle = idleCallbacks();
    await header();
    idle.run();
    await panelArrived();

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    // In the same render as the click, so no fallback shows and the panel
    // doesn't grow when the rest arrives.
    const panel = screen.getByRole('dialog', { name: 'Share the link' });
    expect(within(panel).getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
  });

  it('shows the fallback until the code arrives when it hadn’t yet', async () => {
    idleCallbacks();
    await header();

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    const panel = screen.getByRole('dialog', { name: 'Share the link' });
    expect(within(panel).queryByRole('button', { name: 'Copy link' })).toBeNull();
    expect(await within(panel).findByRole('button', { name: 'Copy link' })).toBeInTheDocument();
  });
});
