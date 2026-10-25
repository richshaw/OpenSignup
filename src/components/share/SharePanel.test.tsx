// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { SharePanel, type SharePanelProps } from './SharePanel';

// The QR code has its own test; here it would only wait on the encoder.
vi.mock('./ShareQrCode', () => ({ ShareQrCode: () => null }));
// What the panel records: each copy or share that worked, once.
const emit = vi.hoisted(() => vi.fn());
vi.mock('@/lib/signup-link-events', () => ({ emitSignupLinkEvent: emit }));

const LINK = 'https://your-site.example/s/bake-sale-k3x';
const MESSAGE = `Bake sale helpers\nSat, Nov 14 · 8 spots open\nSign up here, no account needed: ${LINK}`;
const writeText = vi.fn<(text: string) => Promise<void>>();

/** The panel with its owner's message state, as the header keeps it. */
function Owner(props: Partial<SharePanelProps>) {
  const [message, setMessage] = useState(MESSAGE);
  return (
    <SharePanel
      variant="desktop"
      firstTime={false}
      signupId="sig_1"
      title="Bake sale helpers"
      url={LINK}
      message={message}
      onMessageChange={setMessage}
      {...props}
    />
  );
}

function giveShareMenu(share: (data: ShareData) => Promise<void>) {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
}

beforeEach(() => {
  emit.mockClear();
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'share');
});

// The heading, "Published" and the ✕ are ShareButton's, and tested there.
describe('<SharePanel /> wording', () => {
  it('says that nobody has the link yet, the first time', () => {
    render(<Owner firstTime />);
    expect(
      screen.getByText('Anyone with the link can sign up. Nobody has it until you send it.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('says how to send it on later visits', () => {
    render(<Owner />);
    expect(
      screen.getByText('Send it by email or in a group chat. Anyone with the link can sign up.'),
    ).toBeInTheDocument();
  });

  it('names a group chat and a text first on a phone', () => {
    render(<Owner variant="phone" />);
    expect(
      screen.getByText(
        'Send it to a group chat, by text or by email. Anyone with the link can sign up.',
      ),
    ).toBeInTheDocument();
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
    expect(emit).toHaveBeenCalledExactlyOnceWith('sig_1', 'copied', 'share_panel');
  });

  it('says so when the clipboard refuses, and selects the link to copy by hand', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    render(<Owner />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    const notice = await screen.findByText('Couldn’t copy. Select the link and copy it.');
    // Right under the row of the button that was refused.
    expect(notice.previousElementSibling).toContainElement(
      screen.getByRole('button', { name: 'Copy link' }),
    );
    expect(screen.queryByText('Link copied')).not.toBeInTheDocument();
    expect(emit).not.toHaveBeenCalled();
    const field = screen.getByLabelText<HTMLInputElement>('Public link');
    expect(field).toHaveFocus();
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, LINK.length]);

    // A copy that works afterwards takes the place of the refusal.
    writeText.mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await screen.findByText('Link copied');
    expect(screen.queryByText('Couldn’t copy. Select the link and copy it.')).toBeNull();
  });

  it('says so when the clipboard refuses the message, and selects it', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    render(<Owner />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));
    const notice = await screen.findByText('Couldn’t copy. Select the message and copy it.');
    expect(notice.previousElementSibling).toContainElement(
      screen.getByRole('button', { name: 'Copy message' }),
    );
    expect(screen.queryByText('Couldn’t copy. Select the link and copy it.')).toBeNull();
    expect(emit).not.toHaveBeenCalled();
    const box = screen.getByLabelText<HTMLTextAreaElement>('A message to send with it');
    expect(box).toHaveFocus();
    expect([box.selectionStart, box.selectionEnd]).toEqual([0, MESSAGE.length]);
  });

  it('announces each copy, the last one made', async () => {
    render(<Owner />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await screen.findByText('Link copied');
    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }));
    await screen.findByText('Message copied');
    expect(screen.queryByText('Link copied')).toBeNull();
    // The link's button, first, still says Copied.
    fireEvent.click(screen.getAllByRole('button', { name: 'Copied' })[0]!);
    await screen.findByText('Link copied');
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
    expect(emit).toHaveBeenCalledExactlyOnceWith('sig_1', 'copied', 'share_message');
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

  it('emails the message without its first line, the title, which is the subject', () => {
    render(<Owner title=" Bake sale helpers " />);
    expect(screen.getByRole('link', { name: 'Email it' })).toHaveAttribute(
      'href',
      `mailto:?subject=Bake%20sale%20helpers&body=${encodeURIComponent(
        MESSAGE.split('\n').slice(1).join('\n'),
      )}`,
    );
  });

  it('emails the whole message once its first line was changed', () => {
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

  it('records Email it as a share when it’s chosen', () => {
    render(<Owner />);
    // jsdom can't open an email app; keep it from trying.
    const stay = (e: Event) => e.preventDefault();
    window.addEventListener('click', stay);
    fireEvent.click(screen.getByRole('link', { name: 'Email it' }));
    window.removeEventListener('click', stay);
    expect(emit).toHaveBeenCalledExactlyOnceWith('sig_1', 'shared', 'email');
  });

  it('keeps Copy message as wide as it gets, so Copied doesn’t move Email it', () => {
    render(<Owner />);
    const copyMessage = screen.getByRole('button', { name: 'Copy message' });
    expect(copyMessage).toHaveClass('min-w-[124px]');
    expect(screen.getByRole('link', { name: 'Email it' })).toHaveClass('min-w-[124px]');
    expect(copyMessage.parentElement).not.toHaveClass('grid');
  });

  it('never offers Share…, even where the browser has a share menu', () => {
    giveShareMenu(async () => {});
    render(<Owner />);
    expect(screen.queryByRole('button', { name: 'Share…' })).not.toBeInTheDocument();
  });

  describe('its message box', () => {
    // jsdom lays nothing out: the box's rows are 20px with 8px of padding
    // above and below and a 1px border, and its content is a row a line.
    let sheet: HTMLStyleElement;
    beforeEach(() => {
      sheet = document.createElement('style');
      sheet.textContent =
        'textarea { line-height: 20px; padding-top: 8px; padding-bottom: 8px; border-top-width: 1px; border-bottom-width: 1px; }';
      document.head.append(sheet);
      vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(function (
        this: HTMLTextAreaElement,
      ) {
        return Math.max(5, this.value.split('\n').length) * 20 + 16;
      });
    });
    afterEach(() => {
      sheet.remove();
      vi.restoreAllMocks();
    });
    const lines = (n: number) => Array.from({ length: n }, (_, i) => `Line ${i + 1}`).join('\n');

    it('fits the message, from 5 rows to 12, as it changes', () => {
      render(<Owner />);
      const box = screen.getByLabelText<HTMLTextAreaElement>('A message to send with it');
      expect(box).toHaveAttribute('rows', '5');
      // 5 rows of 20px, the padding and the border.
      expect(box.style.height).toBe('118px');
      fireEvent.change(box, { target: { value: lines(10) } });
      expect(box.style.height).toBe('218px');
      fireEvent.change(box, { target: { value: lines(30) } });
      expect(box.style.height).toBe('258px');
      fireEvent.change(box, { target: { value: lines(2) } });
      expect(box.style.height).toBe('118px');
    });

    it('keeps the size the organizer dragged it to', () => {
      render(<Owner />);
      const box = screen.getByLabelText<HTMLTextAreaElement>('A message to send with it');
      // What dragging the box's corner does.
      box.style.height = '300px';
      fireEvent.change(box, { target: { value: lines(10) } });
      expect(box.style.height).toBe('300px');
    });
  });
});

describe('<SharePanel /> on a phone', () => {
  it('shows the link to copy by hand when the clipboard refuses it', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    render(<Owner variant="phone" />);
    expect(screen.queryByLabelText('Public link')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    const notice = await screen.findByText('Couldn’t copy. Select the link and copy it.');
    const field = screen.getByLabelText<HTMLInputElement>('Public link');
    expect(field).toHaveValue(LINK);
    // Beside the link's box, above Copy link, not under the message.
    expect(notice.previousElementSibling).toContainElement(field);
    expect(notice.nextElementSibling).toContainElement(
      screen.getByRole('button', { name: 'Copy link' }),
    );
    await waitFor(() => expect(field).toHaveFocus());
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, LINK.length]);
  });

  it('without a share menu, starts on Copy link and keeps Copy message and Email it', () => {
    render(<Owner variant="phone" />);
    expect(screen.queryByRole('button', { name: 'Share…' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy link' })).toHaveFocus();
    expect(screen.getByLabelText('A message to send with it')).toHaveValue(MESSAGE);
    // The sheet scrolls, so its box stays one size.
    expect(screen.getByLabelText('A message to send with it')).toHaveAttribute('rows', '6');
    // Half the row each, under Copy link and QR code.
    const copyMessage = screen.getByRole('button', { name: 'Copy message' });
    expect(copyMessage.parentElement).toHaveClass('grid', 'grid-cols-2');
    expect(copyMessage.parentElement).toContainElement(
      screen.getByRole('link', { name: 'Email it' }),
    );
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
    fireEvent.change(screen.getByLabelText('A message to send with it'), {
      target: { value: 'Bake sale on Saturday, can you help?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Share…' }));
    await screen.findByText('Sent from your phone’s share menu.');
    expect(emit).toHaveBeenCalledExactlyOnceWith('sig_1', 'shared', 'share_menu');
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
    expect(emit).not.toHaveBeenCalled();
  });
});
