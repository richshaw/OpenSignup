import { expect, type APIRequestContext } from '@playwright/test';

async function post(request: APIRequestContext, url: string, data?: unknown) {
  const res = await request.post(url, data === undefined ? {} : { data });
  expect(res.ok(), `${url}: ${await res.text()}`).toBe(true);
  return (await res.json()).data;
}

/**
 * A fresh published signup with one slot, made through the API as the
 * organizer `request` is signed in as, so retries never share a row. A new
 * signup also starts with an empty slot, which this leaves alone. Slot values
 * are keyed by the default template's fields, `what` and `date`.
 */
export async function createPublishedSignup(
  request: APIRequestContext,
  opts: { title: string; slot: { values: Record<string, string>; capacity: number } },
): Promise<{ id: string; slug: string }> {
  const signup = await post(request, '/api/signups', {
    title: opts.title,
    description: '',
    tags: [],
    visibility: 'unlisted',
    settings: {},
  });
  await post(request, `/api/signups/${signup.id}/slots`, opts.slot);
  await post(request, `/api/signups/${signup.id}/publish`);
  return { id: signup.id, slug: signup.slug };
}

/**
 * A fresh draft made through the API, as the organizer `request` is signed in
 * as. It has the default template's fields, `what` and `date`, and its one
 * slot, which starts empty, as a new signup's does, unless `values` fills it.
 */
export async function createDraft(
  request: APIRequestContext,
  opts: { title: string; values?: Record<string, string> },
): Promise<{ id: string; slotId: string }> {
  const signup = await post(request, '/api/signups', {
    title: opts.title,
    description: '',
    tags: [],
    visibility: 'unlisted',
    settings: {},
  });
  const slots = await request.get(`/api/signups/${signup.id}/slots`);
  expect(slots.ok()).toBe(true);
  const slotId = ((await slots.json()).data as { id: string }[])[0]?.id;
  if (!slotId) throw new Error('a new signup should start with one slot');
  if (opts.values) {
    const filled = await request.patch(`/api/slots/${slotId}`, { data: { values: opts.values } });
    expect(filled.ok(), await filled.text()).toBe(true);
  }
  return { id: signup.id, slotId };
}
