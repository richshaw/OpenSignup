import { expect, test } from '@playwright/test';
import { loadSeed } from './helpers/fixtures';

const seed = loadSeed();

test.describe('response headers', () => {
  test('a participant read through the edit token is never cached', async ({ request }) => {
    const res = await request.get(
      `/api/commitments/${seed.editCommitmentId}?token=${seed.editToken}`,
    );
    expect(res.ok()).toBe(true);
    expect(res.headers()['cache-control']).toBe('no-store');
  });

  test('a refused API call is never cached either', async ({ request }) => {
    const res = await request.get(`/api/commitments/${seed.editCommitmentId}`);
    expect(res.status()).toBe(403);
    expect(res.headers()['cache-control']).toBe('no-store');
  });

  test('pages do not name the framework', async ({ request }) => {
    const res = await request.get(`/s/${seed.publicSlug}`);
    expect(res.ok()).toBe(true);
    expect(res.headers()['x-powered-by']).toBeUndefined();
  });
});
