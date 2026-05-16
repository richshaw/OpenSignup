import { describe, expect, it } from 'vitest';
import { explainFetchError } from './MagicComposeRoot';

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
