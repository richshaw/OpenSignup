import { describe, expect, it, vi } from 'vitest';
import { BodyTooLarge, readFormData, readRequestBody } from './request-body';

function streamRequest(stream: ReadableStream<Uint8Array>, headers: Record<string, string> = {}) {
  return new Request('https://x.test/', {
    method: 'POST',
    headers,
    body: stream,
    duplex: 'half',
  } as RequestInit);
}

describe('readRequestBody', () => {
  it('reads a body that fits', async () => {
    const req = new Request('https://x.test/', { method: 'POST', body: 'hello' });
    expect((await readRequestBody(req, 100)).toString('utf8')).toBe('hello');
  });

  it('rejects a declared oversize body without reading it', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      pull: () => expect.unreachable('must not read a body the header already ruled out'),
      cancel,
    });
    await expect(readRequestBody(streamRequest(stream, { 'content-length': '999' }), 10)).rejects.toBeInstanceOf(
      BodyTooLarge,
    );
  });

  it('cancels the stream when a chunked body crosses the cap, so the upload stops', async () => {
    const cancel = vi.fn();
    const chunk = new Uint8Array(8).fill(0x20);
    const stream = new ReadableStream<Uint8Array>({
      pull: (controller) => void controller.enqueue(chunk),
      cancel,
    });
    // No content-length, so the cap can only be enforced while reading.
    await expect(readRequestBody(streamRequest(stream), 16)).rejects.toBeInstanceOf(BodyTooLarge);
    expect(cancel).toHaveBeenCalled();
  });

  it('still reports the size error if cancelling the stream fails', async () => {
    const chunk = new Uint8Array(8).fill(0x20);
    const stream = new ReadableStream<Uint8Array>({
      pull: (controller) => void controller.enqueue(chunk),
      cancel: () => Promise.reject(new Error('cancel blew up')),
    });
    await expect(readRequestBody(streamRequest(stream), 16)).rejects.toBeInstanceOf(BodyTooLarge);
  });
});

describe('readFormData', () => {
  function formRequest(body: string) {
    return new Request('https://x.test/', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
  }

  it('reads a form that fits', async () => {
    const form = await readFormData(formRequest('slug=snacks&action=out'), 100);
    expect(form?.get('slug')).toBe('snacks');
    expect(form?.get('action')).toBe('out');
  });

  it('is null for a form over the cap, a missing body or a body that is not a form', async () => {
    expect(await readFormData(formRequest(`slug=${'x'.repeat(200)}`), 100)).toBeNull();
    expect(await readFormData(new Request('https://x.test/', { method: 'POST' }), 100)).toBeNull();
    const json = new Request('https://x.test/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(await readFormData(json, 100)).toBeNull();
  });
});
