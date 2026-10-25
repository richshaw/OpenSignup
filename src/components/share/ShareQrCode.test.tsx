// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ShareQrCode } from './ShareQrCode';

// The real encoder, unless a test makes it fail.
const encoder = vi.hoisted(() => ({ fails: false }));
vi.mock('lean-qr/nano', async (importOriginal) => {
  const real = await importOriginal<typeof import('lean-qr/nano')>();
  return {
    ...real,
    generate: (...args: Parameters<typeof real.generate>) => {
      if (encoder.fails) throw new Error('offline');
      return real.generate(...args);
    },
  };
});

const emit = vi.hoisted(() => vi.fn());
vi.mock('@/lib/signup-link-events', () => ({ emitSignupLinkEvent: emit }));

const LINK = 'https://your-site.example/s/bake-sale-k3x';
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

/** A canvas that draws nothing and reads back `PNG`; jsdom has none of its own. */
function giveCanvas() {
  const ctx = {
    imageSmoothingEnabled: true,
    createImageData: (w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
    }),
    putImageData: () => {},
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    // Every character 20px wide at any size.
    measureText: (text: string) => ({ width: text.length * 20 }),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(PNG);
  return ctx;
}

/** Stops jsdom following the link once the component's own handler has run. */
function stayOnPage(): () => void {
  const stop = (e: Event) => e.preventDefault();
  window.addEventListener('click', stop);
  return () => window.removeEventListener('click', stop);
}

afterEach(() => {
  emit.mockClear();
  vi.restoreAllMocks();
  encoder.fails = false;
});

const NAME = 'QR code for the sign-up link to Bake sale helpers';

function renderQr(variant: 'desktop' | 'phone') {
  return render(
    <ShareQrCode signupId="sig_1" title=" Bake sale helpers " url={LINK} variant={variant} />,
  );
}

describe('<ShareQrCode /> on a computer', () => {
  it('shows the code, named for the signup, and a Download named after it', () => {
    giveCanvas();
    renderQr('desktop');
    const download = screen.getByRole('link', { name: 'Download QR code' });
    expect(screen.getByText('A QR code for a flyer or a sign-up table.')).toBeInTheDocument();
    expect(download).toHaveTextContent('Download');
    expect(download).toHaveAttribute('download', 'bake-sale-k3x-qr.png');
    expect(screen.getByRole('img', { name: NAME })).toBeInTheDocument();
  });

  it('draws the picture only when Download is chosen, then saves it', () => {
    const ctx = giveCanvas();
    const restore = stayOnPage();
    renderQr('desktop');
    const download = screen.getByRole('link', { name: 'Download QR code' });
    expect(ctx.drawImage).not.toHaveBeenCalled();
    fireEvent.click(download);
    expect(ctx.drawImage).toHaveBeenCalledOnce();
    expect(download).toHaveAttribute('href', PNG);
    // A share from the QR code, recorded once the picture was there to save,
    // and once while the panel is open, however many times it's saved.
    fireEvent.click(download);
    restore();
    expect(emit).toHaveBeenCalledExactlyOnceWith('sig_1', 'shared', 'qr_code');
  });

  it('prints the title under the code, centred, on a white picture taller than it is wide', () => {
    const ctx = giveCanvas();
    const restore = stayOnPage();
    renderQr('desktop');
    fireEvent.click(screen.getByRole('link', { name: 'Download QR code' }));
    restore();
    const [x, y, width, height] = ctx.fillRect.mock.calls[0] as [number, number, number, number];
    expect([x, y]).toEqual([0, 0]);
    expect(height).toBeGreaterThan(width);
    // The code fills the top, a square as wide as the picture.
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, width, width);
    expect(ctx.fillText).toHaveBeenCalledExactlyOnceWith(
      '\u2066Bake sale helpers\u2069',
      width / 2,
      expect.any(Number),
    );
    expect(ctx.fillText.mock.calls[0]![2]).toBeGreaterThan(width);
  });

  it('isolates each line in the title’s direction, so a right-to-left one keeps its ellipsis at its end', () => {
    const ctx = giveCanvas();
    const restore = stayOnPage();
    // Too long for two lines at 20px a character, so the second ends in "…".
    const title =
      'מתנדבים ליריד הספרים של בית הספר, הקמה, מכירה ופירוק בשבת בבוקר, ואחר כך ניקיון האולם וסידור הכיסאות';
    render(<ShareQrCode signupId="sig_1" title={title} url={LINK} variant="desktop" />);
    fireEvent.click(screen.getByRole('link', { name: 'Download QR code' }));
    restore();
    const drawn = ctx.fillText.mock.calls.map(([text]) => text as string);
    expect(drawn).toHaveLength(2);
    for (const text of drawn) expect(text).toMatch(/^\u2067[^\u2066-\u2069]+\u2069$/);
    expect(drawn[1]).toMatch(/…\u2069$/);
  });
});

describe('<ShareQrCode /> on a phone', () => {
  /** Where the phone can share a file, what it was asked to share. */
  function giveFileSharing(share: (data: ShareData) => Promise<void>) {
    Object.defineProperty(navigator, 'canShare', {
      value: (data: ShareData) => (data.files?.length ?? 0) > 0,
      configurable: true,
    });
    Object.defineProperty(navigator, 'share', { value: vi.fn(share), configurable: true });
    return navigator.share as unknown as ReturnType<typeof vi.fn>;
  }

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'canShare');
    Reflect.deleteProperty(navigator, 'share');
  });

  it('is a QR code button, named by what it says, that shows the code large', () => {
    giveCanvas();
    renderQr('phone');
    const button = screen.getByRole('button', { name: 'QR code' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).not.toHaveClass('bg-brand-soft');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save image' })).not.toBeInTheDocument();

    fireEvent.click(button);
    // Open, it looks pressed and says what one more tap does, by name too.
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAccessibleName('Hide QR code');
    expect(button).toHaveClass('border-brand', 'bg-brand-soft');
    const code = screen.getByRole('img', { name: NAME });
    expect(button).toHaveAttribute('aria-controls', code.parentElement!.id);
    expect(screen.getByRole('button', { name: 'Save image' })).toBeInTheDocument();
    // Shown large is a share from the QR code; showing it again isn't another.
    expect(emit).toHaveBeenCalledExactlyOnceWith('sig_1', 'shared', 'qr_code');

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAccessibleName('QR code');
    expect(button).not.toHaveClass('bg-brand-soft');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(emit).toHaveBeenCalledOnce();
  });

  it('hands the picture to the phone’s share menu where it can share a file, and leaves the saying to it', async () => {
    giveCanvas();
    const share = giveFileSharing(async () => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    renderQr('phone');
    fireEvent.click(screen.getByRole('button', { name: 'QR code' }));
    const save = screen.getByRole('button', { name: 'Save image' });
    const live = save.nextElementSibling!;
    await act(async () => {
      fireEvent.click(save);
    });
    const [{ files }] = share.mock.calls[0] as [ShareData];
    expect(files).toHaveLength(1);
    expect(files![0]!.name).toBe('bake-sale-k3x-qr.png');
    expect(files![0]!.type).toBe('image/png');
    // It may have gone to another app rather than been saved, so no "Saved".
    expect(save).toHaveTextContent('Save image');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toBeEmptyDOMElement();
    expect(click).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledOnce();
  });

  it('says nothing when the share menu is closed without saving', async () => {
    giveCanvas();
    const share = giveFileSharing(async () => {
      throw new DOMException('Share canceled', 'AbortError');
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    renderQr('phone');
    fireEvent.click(screen.getByRole('button', { name: 'QR code' }));
    const save = screen.getByRole('button', { name: 'Save image' });
    await act(async () => {
      fireEvent.click(save);
    });
    expect(share).toHaveBeenCalledOnce();
    expect(save).toHaveTextContent('Save image');
    expect(save.nextElementSibling).toBeEmptyDOMElement();
    expect(click).not.toHaveBeenCalled();
  });

  it('takes no second tap while the share menu is open, nor downloads for one', async () => {
    giveCanvas();
    let close = () => {};
    const share = giveFileSharing(
      () =>
        new Promise<void>((_, reject) => {
          close = () => reject(new DOMException('Share canceled', 'AbortError'));
        }),
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    renderQr('phone');
    fireEvent.click(screen.getByRole('button', { name: 'QR code' }));
    const save = screen.getByRole('button', { name: 'Save image' });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(share).toHaveBeenCalledOnce();
    await act(async () => close());
    // Once it's closed, Save image works again.
    fireEvent.click(save);
    expect(share).toHaveBeenCalledTimes(2);
    expect(click).not.toHaveBeenCalled();
    expect(save).toHaveTextContent('Save image');
  });

  it('says nothing when the phone says a share menu is already open', async () => {
    giveCanvas();
    giveFileSharing(async () => {
      throw new DOMException('An earlier share has not yet completed.', 'InvalidStateError');
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    renderQr('phone');
    fireEvent.click(screen.getByRole('button', { name: 'QR code' }));
    const save = screen.getByRole('button', { name: 'Save image' });
    await act(async () => {
      fireEvent.click(save);
    });
    expect(save).toHaveTextContent('Save image');
    expect(save.nextElementSibling).toBeEmptyDOMElement();
    expect(click).not.toHaveBeenCalled();
  });

  it('downloads the picture where the phone can’t share a file, then says Saved', async () => {
    giveCanvas();
    const saved: { href: string; download: string; attached: boolean }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push({ href: this.href, download: this.download, attached: this.isConnected });
    });
    renderQr('phone');
    fireEvent.click(screen.getByRole('button', { name: 'QR code' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save image' }));
    await screen.findByRole('button', { name: 'Saved' });
    expect(screen.getByText('QR code saved')).toHaveAttribute('aria-live', 'polite');
    expect(saved).toEqual([{ href: PNG, download: 'bake-sale-k3x-qr.png', attached: true }]);
    // Back to Save image after a moment.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save image' })).toBeVisible(), {
      timeout: 3000,
    });
  });

  it('downloads it instead when the phone refuses to share it', async () => {
    giveCanvas();
    giveFileSharing(async () => {
      throw new DOMException('Permission denied', 'NotAllowedError');
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderQr('phone');
    fireEvent.click(screen.getByRole('button', { name: 'QR code' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save image' }));
    await screen.findByRole('button', { name: 'Saved' });
    expect(click).toHaveBeenCalledOnce();
  });
});

describe('<ShareQrCode /> where it can’t be drawn', () => {
  it('is never there where the browser has no canvas to draw on', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { container } = renderQr('phone');
    expect(container).toBeEmptyDOMElement();
  });

  it('takes itself away when the canvas won’t give the picture back', () => {
    giveCanvas();
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => {
      throw new DOMException('Tainted canvases may not be exported.', 'SecurityError');
    });
    const { container } = renderQr('desktop');
    const download = screen.getByRole('link', { name: 'Download QR code' });
    // fireEvent returns false when the default action was prevented.
    expect(fireEvent.click(download)).toBe(false);
    expect(container).toBeEmptyDOMElement();
    expect(emit).not.toHaveBeenCalled();
  });

  it('takes itself away on a phone too, once Save image finds it can’t', () => {
    giveCanvas();
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => {
      throw new DOMException('Tainted canvases may not be exported.', 'SecurityError');
    });
    const { container } = renderQr('phone');
    fireEvent.click(screen.getByRole('button', { name: 'QR code' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save image' }));
    expect(container).toBeEmptyDOMElement();
  });

  it('leaves itself out when the encoder fails, so the panel goes on without it', () => {
    giveCanvas();
    encoder.fails = true;
    const { container } = renderQr('desktop');
    expect(container).toBeEmptyDOMElement();
  });
});
