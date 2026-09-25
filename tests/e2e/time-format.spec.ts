import { expect, test, type APIRequestContext } from '@playwright/test';
import { loginAsSeededOrganizer } from './helpers/auth';

/**
 * Time fields are stored as 24-hour HH:MM and shown on a 12-hour clock. The
 * unit tests pin `formatSlotTime`; this checks the rendered pages actually use
 * it: the builder's collapsed slot row and the public signup page.
 */
test.describe('time field display', () => {
  test.beforeEach(async ({ context }) => {
    await loginAsSeededOrganizer(context);
  });

  async function post(request: APIRequestContext, url: string, data?: unknown) {
    const res = await request.post(url, data === undefined ? {} : { data });
    expect(res.ok(), `${url}: ${await res.text()}`).toBe(true);
    return (await res.json()).data;
  }

  test('a stored 18:30 reads as 6:30 PM in the builder and on the public page', async ({
    page,
  }) => {
    // A fresh signup per run so retries and projects never compete over one row.
    // createSignup applies DEFAULT_TEMPLATE: fields `what` (text) and `date`.
    const signup = await post(page.request, '/api/signups', {
      title: `Time format ${Date.now()}`,
      description: '',
      tags: [],
      visibility: 'unlisted',
      settings: {},
    });
    await post(page.request, `/api/signups/${signup.id}/fields`, {
      ref: 'time',
      label: 'Time',
      fieldType: 'time',
      config: { fieldType: 'time' },
    });
    await post(page.request, `/api/signups/${signup.id}/slots`, {
      values: { what: 'Snacks', date: '2026-09-30', time: '18:30' },
      capacity: 1,
    });
    await post(page.request, `/api/signups/${signup.id}/publish`);

    await page.goto(`/app/signups/${signup.id}/build`);
    const builderRow = page.getByRole('button', { name: /Edit slot .*Snacks/ });
    await expect(builderRow).toContainText('6:30 PM');
    await expect(builderRow).not.toContainText('18:30');

    await page.goto(`/s/${signup.slug}`);
    const publicRow = page.locator('ul li').filter({ hasText: 'Snacks' });
    await expect(publicRow).toContainText('6:30 PM');
    await expect(publicRow).not.toContainText('18:30');
  });
});
