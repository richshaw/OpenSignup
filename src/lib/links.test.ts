import { beforeEach, describe, expect, it, vi } from 'vitest';

let appUrl = 'https://signup.example.org';
vi.mock('./env', () => ({ getEnv: () => ({ NEXT_PUBLIC_APP_URL: appUrl }) }));

const { commitmentLinks, publicSignupUrl, reminderUnsubscribePostUrl } = await import('./links');

describe('absolute links', () => {
  beforeEach(() => {
    appUrl = 'https://signup.example.org';
  });

  it('joins the path onto the configured origin', () => {
    expect(publicSignupUrl('bake-sale')).toBe('https://signup.example.org/s/bake-sale');
  });

  it('does not double the slash when the origin ends in one', () => {
    appUrl = 'https://signup.example.org/';
    expect(reminderUnsubscribePostUrl('par_1', 'tok')).toBe(
      'https://signup.example.org/api/public/reminder-optout?p=par_1&token=tok',
    );
  });
});

describe('commitmentLinks', () => {
  beforeEach(() => {
    appUrl = 'https://signup.example.org';
  });

  it('builds the edit page URL and the edit, self and cancel links', () => {
    expect(commitmentLinks('bake-sale', 'com_1', 'tok')).toEqual({
      editUrl: 'https://signup.example.org/s/bake-sale/c/com_1?token=tok',
      links: {
        edit: { href: 'https://signup.example.org/s/bake-sale/c/com_1?token=tok', method: 'GET' },
        self: { href: '/api/commitments/com_1?token=tok', method: 'GET' },
        cancel: { href: '/api/commitments/com_1?token=tok', method: 'DELETE' },
      },
    });
  });
});
