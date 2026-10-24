// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { SharePanel, type SharePanelProps } from './SharePanel';

// The QR code has its own test; here it would only wait on the encoder.
vi.mock('./ShareQrCode', () => ({ ShareQrCode: () => null }));

const LINK = 'https://your-site.example/s/bake-sale-k3x';
const MESSAGE = `Bake sale helpers\nSat, Nov 14 · 4 slots · 8 spots\nSign up here: ${LINK}`;
const writeText = vi.fn<(text: string) => Promise<void>>();

/** The panel with its owner's message state, as the header keeps it. */
function Owner(props: Partial<SharePanelProps>) {
  const [message, setMessage] = useState(MESSAGE);
  return (
    <SharePanel
      variant="desktop"
      firstTime={false}
      title="Bake sale helpers"
      url={LINK}
      message={message}
      onMessageChange={setMessage}
      onClose={() => {}}
      {...props}
    />
  );
}

function giveShareMenu(share: (data: ShareData) => Promise<void>) {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
}

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'share');
});

describe('<SharePanel /> wording', () => {
  it('says it was published, and that nobody has the link yet, the first time', () => {
    render(<Owner firstTime headingId="share-heading" />);
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Now send people the link' })).toHaveAttribute(
      'id',
      'share-heading',
    );
    expect(
      screen.getByText('Anyone with the link can sign up. Nobody has it until you send it.'),
    ).toBeInTheDocument();
  });

  it('says how to send it on later visits', () => {
    render(<Owner />);
    expect(screen.queryByText('Published')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Share the link' })).toBeInTheDocument();
    expect(
      screen.getByText('Send it by email or in a group chat. Anyone with the link can sign up.'),
    ).toBeInTheDocument();
  });

  it('names a group chat and a text first on a phone, whose sheet has the heading', () => {
    render(<Owner variant="phone" />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Send it to a group chat, by text or by email. Anyone with the link can sign up.',
      ),
    ).toBeInTheDocument();
  });

  it('closes from its ✕', () => {
    const onClose = vi.fn();
    render(<Owner onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('<SharePanel /> on a computer', () => {
  it('shows the link, selected whole when it gets focus', () => {
    render(<Owner />);
    const field = screen.getByLabelText<HTMLInputElement>('Public link');
    expect(field).toHaveValue(LINK);
    expect(field).toHaveAttribute('readonly');
    fireEvent.focus(field);
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, LINK.length]);
  });

  it('starts on Copy link', () => {
    render(<Owner />);
    expect(screen.getByRole('button', { name: 'Copy link' })).toHaveFocus();
  });

  it('copies the link, says Copied, and announces it', async () => {
    render(<Owner />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await screen.findByRole('button', { name: 'Copied' });
    expect(writeText).toHaveBeenCalledExactlyOnceWith(LINK);
    expect(screen.getByText('Link copied')).toBeInTheDocument();
  });

  it('says nothing when the clipboard refuses', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    render(<Owner />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    expect(screen.queryByText('Link copied')).not.toBeInTheDocument();
  });

  it('copies the message as edited', async () => {
    render(<Owner />);
    const box = screen.getByLabelText('A message to send with it');
    expect(box).toHaveValue(MESSAGE);
    const edited = `Hi all, can you help at the bake sale? ${LINK}`;
    fireEvent.change(box, { target: { value: edited } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));
    await screen.findByText('Message copied');
    expect(writeText).toHaveBeenCalledExactlyOnceWith(edited);
  });

  it('puts the link back when the edit took it out', async () => {
    render(<Owner />);
    fireEvent.change(screen.getByLabelText('A message to send with it'), {
      target: { value: 'Hi all, can you help at the bake sale?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`Hi all, can you help at the bake sale?\n${LINK}`),
    );
  });

  it('emails the message, with the title as the subject', () => {
    render(<Owner title=" Bake sale helpers " />);
    fireEvent.change(screen.getByLabelText('A message to send with it'), {
      target: { value: `Can you help? & bring a friend: ${LINK}` },
    });
    expect(screen.getByRole('link', { name: 'Email it' })).toHaveAttribute(
      'href',
      `mailto:?subject=Bake%20sale%20helpers&body=${encodeURIComponent(
        `Can you help? & bring a friend: ${LINK}`,
      )}`,
    );
  });

  it('never offers Share…, even where the browser has a share menu', () => {
    giveShareMenu(async () => {});
    render(<Owner />);
    expect(screen.queryByRole('button', { name: 'Share…' })).not.toBeInTheDocument();
  });
});

describe('<SharePanel /> on a phone', () => {
  it('without a share menu, starts on Copy link and keeps Copy message and Email it', () => {
    render(<Owner variant="phone" />);
    expect(screen.queryByRole('button', { name: 'Share…' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy link' })).toHaveFocus();
    expect(screen.getByLabelText('The message that goes with it')).toHaveValue(MESSAGE);
    expect(screen.getByRole('button', { name: 'Copy message' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Email it' })).toBeInTheDocument();
  });

  it('with a share menu, starts on Share…, which stands in for Copy message and Email it', () => {
    giveShareMenu(async () => {});
    render(<Owner variant="phone" />);
    expect(screen.getByRole('button', { name: 'Share…' })).toHaveFocus();
    expect(
      screen.getByText('Opens your phone’s share menu, with the message and link.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy message' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Email it' })).not.toBeInTheDocument();
  });

  it('shares the message as edited, with the link in its text and not again as a url', async () => {
    const share = vi.fn(async (_data: ShareData) => {});
    giveShareMenu(share);
    render(<Owner variant="phone" />);
    fireEvent.change(screen.getByLabelText('The message that goes with it'), {
      target: { value: 'Bake sale on Saturday, can you help?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Share…' }));
    await screen.findByText('Sent from your phone’s share menu.');
    expect(share).toHaveBeenCalledExactlyOnceWith({
      title: 'Bake sale helpers',
      text: `Bake sale on Saturday, can you help?\n${LINK}`,
    });
  });

  it('does nothing when the share menu is closed without sending', async () => {
    const share = vi.fn(async (_data: ShareData) => {
      throw new DOMException('Share canceled', 'AbortError');
    });
    giveShareMenu(share);
    render(<Owner variant="phone" />);
    fireEvent.click(screen.getByRole('button', { name: 'Share…' }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    await Promise.resolve();
    expect(
      screen.getByText('Opens your phone’s share menu, with the message and link.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Sent from your phone’s share menu.')).not.toBeInTheDocument();
  });
});
