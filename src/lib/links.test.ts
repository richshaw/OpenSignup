import { beforeEach, describe, expect, it, vi } from 'vitest';

let appUrl = 'https://signup.example.org';
vi.mock('./env', () => ({ getEnv: () => ({ NEXT_PUBLIC_APP_URL: appUrl }) }));

const {
  commitmentEditPath,
  commitmentLinks,
  publicSignupUrl,
  reminderUnsubscribePostUrl,
  unsubscribePath,
} = await import('./links');

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

describe('commitmentEditPath', () => {
  it('builds the edit page path relative to the site', () => {
    expect(commitmentEditPath('bake-sale', 'com_1', 'tok')).toBe('/s/bake-sale/c/com_1?token=tok');
  });

  it('encodes the id and token', () => {
    expect(commitmentEditPath('bake-sale', 'com/1', 'a+b/c=')).toBe(
      '/s/bake-sale/c/com%2F1?token=a%2Bb%2Fc%3D',
    );
  });
});

describe('reminder opt-out links', () => {
  beforeEach(() => {
    appUrl = 'https://signup.example.org';
  });

  it('builds the confirm page path', () => {
    expect(unsubscribePath('bake-sale', 'par_1', 'tok')).toBe(
      '/s/bake-sale/unsubscribe?p=par_1&token=tok',
    );
  });

  it('appends a status after the credentials', () => {
    expect(unsubscribePath('bake-sale', 'par_1', 'tok', 'done=off')).toBe(
      '/s/bake-sale/unsubscribe?p=par_1&token=tok&done=off',
    );
    expect(unsubscribePath('bake-sale', 'par_1', 'tok', 'error=1')).toBe(
      '/s/bake-sale/unsubscribe?p=par_1&token=tok&error=1',
    );
  });

  it('encodes values so they cannot add a parameter', () => {
    expect(unsubscribePath('bake-sale', 'x&done=on', 'a+b/c=', 'error=1')).toBe(
      '/s/bake-sale/unsubscribe?p=x%26done%3Don&token=a%2Bb%2Fc%3D&error=1',
    );
  });

  it('encodes the one-click URL the same way', () => {
    expect(reminderUnsubscribePostUrl('par_1', 'a+b/c=')).toBe(
      'https://signup.example.org/api/public/reminder-optout?p=par_1&token=a%2Bb%2Fc%3D',
    );
  });
});
