// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

describe('<ShareQrCode />', () => {
  it('on a computer, shows the code and a Download named after the signup', () => {
    giveCanvas();
    render(<ShareQrCode signupId="sig_1" url={LINK} variant="desktop" />);
    const download = screen.getByRole('link', { name: 'Download QR code' });
    expect(screen.getByText('A QR code for a flyer or a sign-up table.')).toBeInTheDocument();
    expect(download).toHaveTextContent('Download');
    expect(download).toHaveAttribute('download', 'bake-sale-k3x-qr.png');
    expect(screen.getByRole('img', { name: 'QR code for the link' })).toBeInTheDocument();
  });

  it('on a phone, is a QR code button with no preview', () => {
    giveCanvas();
    render(<ShareQrCode signupId="sig_1" url={LINK} variant="phone" />);
    const download = screen.getByRole('link', { name: 'Download QR code' });
    expect(download).toHaveTextContent('QR code');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('draws the picture only when Download is chosen, then saves it', () => {
    const ctx = giveCanvas();
    const restore = stayOnPage();
    render(<ShareQrCode signupId="sig_1" url={LINK} variant="desktop" />);
    const download = screen.getByRole('link', { name: 'Download QR code' });
    expect(ctx.drawImage).not.toHaveBeenCalled();
    fireEvent.click(download);
    restore();
    expect(ctx.drawImage).toHaveBeenCalledOnce();
    expect(download).toHaveAttribute('href', PNG);
    // A share from the QR code, recorded once the picture was there to save.
    expect(emit).toHaveBeenCalledExactlyOnceWith('sig_1', 'shared', 'qr_code');
  });

  it('is never there where the browser has no canvas to draw on', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { container } = render(<ShareQrCode signupId="sig_1" url={LINK} variant="phone" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('takes itself away when the canvas won’t give the picture back', () => {
    giveCanvas();
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => {
      throw new DOMException('Tainted canvases may not be exported.', 'SecurityError');
    });
    const { container } = render(<ShareQrCode signupId="sig_1" url={LINK} variant="phone" />);
    const download = screen.getByRole('link', { name: 'Download QR code' });
    // fireEvent returns false when the default action was prevented.
    expect(fireEvent.click(download)).toBe(false);
    expect(container).toBeEmptyDOMElement();
    expect(emit).not.toHaveBeenCalled();
  });

  it('leaves itself out when the encoder fails, so the panel goes on without it', () => {
    giveCanvas();
    encoder.fails = true;
    const { container } = render(<ShareQrCode signupId="sig_1" url={LINK} variant="desktop" />);
    expect(container).toBeEmptyDOMElement();
  });
});
