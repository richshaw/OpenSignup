// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ShareQrCode } from './ShareQrCode';

// The real encoder, unless a test makes it fail as a chunk that won't load
// would: the component's import then rejects the same way.
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
  vi.restoreAllMocks();
  encoder.fails = false;
});

describe('<ShareQrCode />', () => {
  it('on a computer, shows the code and a Download named after the signup', async () => {
    render(<ShareQrCode url={LINK} variant="desktop" />);
    expect(screen.getByText('A QR code for a flyer or a sign-up table.')).toBeInTheDocument();
    const download = await screen.findByRole('link', { name: 'Download QR code' });
    expect(download).toHaveTextContent('Download');
    expect(download).toHaveAttribute('download', 'bake-sale-k3x-qr.png');
    expect(screen.getByRole('img', { name: 'QR code for the link' })).toBeInTheDocument();
  });

  it('on a phone, is a QR code button with no preview', async () => {
    render(<ShareQrCode url={LINK} variant="phone" />);
    const download = await screen.findByRole('link', { name: 'Download QR code' });
    expect(download).toHaveTextContent('QR code');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('draws the picture only when Download is chosen, then saves it', async () => {
    const ctx = giveCanvas();
    const restore = stayOnPage();
    render(<ShareQrCode url={LINK} variant="desktop" />);
    const download = await screen.findByRole('link', { name: 'Download QR code' });
    expect(ctx.drawImage).not.toHaveBeenCalled();
    fireEvent.click(download);
    restore();
    expect(ctx.drawImage).toHaveBeenCalledOnce();
    expect(download).toHaveAttribute('href', PNG);
  });

  it('saves nothing where the browser can’t draw it', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    render(<ShareQrCode url={LINK} variant="desktop" />);
    const download = await screen.findByRole('link', { name: 'Download QR code' });
    // fireEvent returns false when the default action was prevented.
    expect(fireEvent.click(download)).toBe(false);
    expect(download).toHaveAttribute('href', '#');
  });

  it('leaves itself out when the encoder can’t load, so the panel goes on without it', async () => {
    encoder.fails = true;
    const { container } = render(<ShareQrCode url={LINK} variant="desktop" />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
