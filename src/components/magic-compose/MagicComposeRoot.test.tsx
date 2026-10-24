// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MagicComposeRoot, explainFetchError } from './MagicComposeRoot';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

async function draft(prompt: string) {
  render(<MagicComposeRoot />);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: prompt } });
  fireEvent.click(screen.getByRole('button', { name: /Draft my signup/ }));
  return screen.findByRole('alert');
}

describe('<MagicComposeRoot /> errors', () => {
  it("says the hour's AI drafts are used up, links the manual form, and drops the server's suggestion", async () => {
    stubFetch(429, {
      error: {
        code: 'rate_limited',
        message: 'too many requests',
        suggestion: 'wait 700s and retry',
        details: { retryAfterSeconds: 700, bucket: 'magic.compose' },
      },
    });
    const alert = await draft('Bake sale');
    expect(alert).toHaveTextContent(
      "You've used this hour's AI drafts. Try again in 12 minutes, or fill it in by hand.",
    );
    expect(alert).not.toHaveTextContent(/wait 700s/);
    expect(screen.getByRole('link', { name: 'fill it in by hand' })).toHaveAttribute(
      'href',
      '/app/signups/new?manual=1',
    );
  });

  it('says one minute, not one minutes', async () => {
    stubFetch(429, {
      error: {
        code: 'rate_limited',
        message: 'too many requests',
        details: { retryAfterSeconds: 30, bucket: 'magic.compose' },
      },
    });
    expect(await draft('Bake sale')).toHaveTextContent('Try again in 1 minute, or');
  });

  it("calls the provider's own 429 a busy service", async () => {
    stubFetch(429, {
      error: {
        code: 'rate_limited',
        message: 'AI provider is rate limiting requests. Try again in 30s.',
        details: { llmErrorCode: 'rate_limited', retryAfterSeconds: 30 },
      },
    });
    const alert = await draft('Bake sale');
    expect(alert).toHaveTextContent('The AI service is busy. Try again in a minute.');
    expect(alert).not.toHaveTextContent(/30s/);
  });

  it('keeps the description after an error', async () => {
    stubFetch(500, {
      error: { code: 'internal', message: 'AI drafting timed out. Try a simpler prompt.' },
    });
    expect(await draft('Bake sale')).toHaveTextContent(
      'AI drafting timed out. Try a simpler prompt.',
    );
    expect(screen.getByRole('textbox')).toHaveValue('Bake sale');
  });

  it('suggests a simpler prompt when a first call runs too long', () => {
    // A reply that never comes.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    render(<MagicComposeRoot />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Bake sale' } });
    fireEvent.click(screen.getByRole('button', { name: /Draft my signup/ }));
    act(() => {
      vi.advanceTimersByTime(210_000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'AI drafting is taking longer than expected. Try again or simplify your prompt.',
    );
    expect(screen.getByRole('textbox')).toHaveValue('Bake sale');
  });
});

describe('explainFetchError', () => {
  it('treats AbortError as a cancellation, not a network problem', () => {
    const e = new DOMException('aborted', 'AbortError');
    expect(explainFetchError(e)).toMatch(/cancelled/i);
  });

  it('treats TypeError (fetch failure) as a connectivity problem', () => {
    const e = new TypeError('Failed to fetch');
    expect(explainFetchError(e)).toMatch(/connection/i);
    expect(explainFetchError(e)).not.toMatch(/failed to fetch/i);
  });

  it('treats SyntaxError as a parse problem', () => {
    const e = new SyntaxError('Unexpected token');
    expect(explainFetchError(e)).toMatch(/unexpected response/i);
  });

  it('falls back to a generic message for unknown errors', () => {
    expect(explainFetchError(new Error('weird'))).toMatch(/Something went wrong/);
    expect(explainFetchError('a string')).toMatch(/Something went wrong/);
  });
});
