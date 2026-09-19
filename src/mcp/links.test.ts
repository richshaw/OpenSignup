import { describe, expect, it, vi } from 'vitest';
import { signupLinks } from './links';

// A trailing slash on the app URL must not double up in the links.
vi.mock('@/lib/env', () => ({
  getEnv: () => ({ NEXT_PUBLIC_APP_URL: 'https://signup.example.org/' }),
}));

describe('signupLinks', () => {
  it('gives the edit, preview and public pages as absolute URLs', () => {
    expect(signupLinks({ id: 'sig_1', slug: 'bake-sale' })).toEqual({
      edit: 'https://signup.example.org/app/signups/sig_1/build',
      preview: 'https://signup.example.org/app/signups/sig_1/preview',
      public: 'https://signup.example.org/s/bake-sale',
    });
  });
});
