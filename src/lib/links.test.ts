import { beforeEach, describe, expect, it, vi } from 'vitest';

let appUrl = 'https://signup.example.org';
vi.mock('./env', () => ({ getEnv: () => ({ NEXT_PUBLIC_APP_URL: appUrl }) }));

const { publicSignupUrl, reminderUnsubscribePostUrl } = await import('./links');

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
