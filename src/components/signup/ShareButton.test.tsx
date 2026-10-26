// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PublishButton } from './PublishButton';
import { ShareButton } from './ShareButton';
import { ShareScope } from './ShareScope';
import type { StatusAction } from './StatusActionForm';

// The QR code has its own test; here it would only wait on the encoder.
vi.mock('@/components/share/ShareQrCode', () => ({ ShareQrCode: () => null }));
// The real loader, watched, to see Publish start it.
const loads = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/components/share/load-share-panel', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/components/share/load-share-panel')>();
  return {
    ...real,
    loadSharePanel: () => {
      loads.count += 1;
      return real.loadSharePanel();
    },
  };
});

const LINK = 'https://your-site.example/s/bake-sale-k3x';
const MESSAGE = `Bake sale helpers\n8 spots open\nSign up here, no account needed: ${LINK}`;

/** A window this wide; jsdom has no matchMedia of its own. */
function windowWidth(width: number) {
  window.matchMedia = (query: string) =>
    ({
      matches: width >= Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList;
}

/** Both headers' Share buttons, as SignupHeader lays them out, and Publish and share. */
function Header({
  action = async () => null,
  message = MESSAGE,
}: {
  action?: StatusAction;
  message?: string;
}) {
  return (
    <ShareScope
      publishAction={action}
      signupId="sig_1"
      title="Bake sale helpers"
      url={LINK}
      message={message}
    >
      <PublishButton variant="desktop" />
      <div data-testid="desktop">
        <ShareButton variant="desktop" />
      </div>
      <div data-testid="phone">
        <ShareButton variant="phone" />
      </div>
    </ShareScope>
  );
}

const shareIn = (where: 'desktop' | 'phone') =>
  within(screen.getByTestId(where)).getByRole('button', { name: 'Share' });

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(async () => {}) },
    configurable: true,
  });
});

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('ShareButton on a computer', () => {
  beforeEach(() => windowWidth(1280));

  it('opens the panel under the button, named by its heading, focus on Copy link', async () => {
    render(<Header />);
    const share = shareIn('desktop');
    expect(share).toHaveAttribute('aria-haspopup', 'dialog');
    expect(share).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(share);
    expect(share).toHaveAttribute('aria-expanded', 'true');
    const panel = await screen.findByRole('dialog', { name: 'Share the link' });
    expect(within(screen.getByTestId('desktop')).getByRole('dialog')).toBe(panel);
    await waitFor(() =>
      expect(within(panel).getByRole('button', { name: 'Copy link' })).toHaveFocus(),
    );
    // One panel: the phone's sheet stays shut.
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('has its heading and ✕ from the start, before the rest has loaded', () => {
    render(<Header />);
    fireEvent.click(shareIn('desktop'));
    const panel = screen.getByRole('dialog', { name: 'Share the link' });
    expect(within(panel).getByRole('heading', { name: 'Share the link' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('starts loading the panel as Publish is pressed', async () => {
    let answer: (result: { published: true }) => void = () => {};
    const publish = vi.fn<StatusAction>(() => new Promise((resolve) => (answer = resolve)));
    render(<Header action={publish} />);
    const before = loads.count;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publish and share' }));
    });
    expect(publish).toHaveBeenCalledOnce();
    expect(loads.count).toBe(before + 1);
    await act(async () => answer({ published: true }));
    expect(await screen.findByRole('dialog', { name: 'Now send people the link' })).toBeVisible();
  });

  it('closes on Escape and on its ✕, and puts focus back on Share', async () => {
    render(<Header />);
    const share = shareIn('desktop');
    fireEvent.click(share);
    const copy = await screen.findByRole('button', { name: 'Copy link' });
    fireEvent.keyDown(copy, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(share).toHaveFocus();

    fireEvent.click(share);
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(share).toHaveFocus();
  });

  it('opens in its first-time form when Publish says it published', async () => {
    render(<Header action={async () => ({ published: true })} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publish and share' }));
    });
    const panel = await screen.findByRole('dialog', { name: 'Now send people the link' });
    expect(within(panel).getByText('Published')).toBeInTheDocument();
    await waitFor(() =>
      expect(within(panel).getByRole('button', { name: 'Copy link' })).toHaveFocus(),
    );

    // Share later opens it in its usual form.
    fireEvent.keyDown(panel, { key: 'Escape' });
    fireEvent.click(shareIn('desktop'));
    expect(await screen.findByRole('dialog', { name: 'Share the link' })).toBeInTheDocument();
    expect(screen.queryByText('Published')).toBeNull();
  });

  it('stays shut when Publish is refused', async () => {
    render(<Header action={async () => ({ error: 'You don’t have edit access.' })} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publish and share' }));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps an edited message while the page is open', async () => {
    render(<Header />);
    fireEvent.click(shareIn('desktop'));
    const box = await screen.findByLabelText('A message to send with it');
    fireEvent.change(box, { target: { value: `Can you help on Saturday? ${LINK}` } });
    fireEvent.keyDown(box, { key: 'Escape' });

    fireEvent.click(shareIn('desktop'));
    expect(await screen.findByLabelText('A message to send with it')).toHaveValue(
      `Can you help on Saturday? ${LINK}`,
    );
  });

  it('takes a fresher message from the server until the organizer edits it', async () => {
    const { rerender } = render(<Header />);
    rerender(
      <Header
        message={`Bake sale helpers\nSat, Nov 14 · 5 spots left\nSign up here, no account needed: ${LINK}`}
      />,
    );
    fireEvent.click(shareIn('desktop'));
    const box = await screen.findByLabelText('A message to send with it');
    expect(box).toHaveValue(
      `Bake sale helpers\nSat, Nov 14 · 5 spots left\nSign up here, no account needed: ${LINK}`,
    );

    fireEvent.change(box, { target: { value: 'Mine' } });
    rerender(<Header message={MESSAGE} />);
    expect(screen.getByLabelText('A message to send with it')).toHaveValue('Mine');
  });
});

describe('ShareButton on a phone', () => {
  beforeEach(() => windowWidth(390));

  it('opens a sheet, named by its title, and puts focus back on Share when it closes', async () => {
    render(<Header />);
    const share = shareIn('phone');
    fireEvent.click(share);
    const sheet = await screen.findByRole('dialog', { name: 'Share the link' });
    expect(within(sheet).queryByText('Published')).toBeNull();
    await waitFor(() =>
      expect(within(sheet).getByRole('button', { name: 'Copy link' })).toHaveFocus(),
    );
    expect(within(sheet).getByLabelText('A message to send with it')).toHaveValue(MESSAGE);

    fireEvent.click(within(sheet).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(share).toHaveFocus());
  });

  it('says Published the first time, beside the title', async () => {
    render(<Header action={async () => ({ published: true })} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publish and share' }));
    });
    const sheet = await screen.findByRole('dialog', { name: 'Now send people the link' });
    expect(sheet).toHaveAccessibleDescription('Published');
  });
});
