// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SESSION_MAX_AGE_SECONDS } from '@/auth/session-lifetime';
import CookiesPage from './page';

// The text of each cell in the table row whose first cell names `cookie`.
function rowFor(cookie: string): string[] {
  const row = screen.getByText(cookie, { exact: false }).closest('tr');
  if (!row) throw new Error(`no row for ${cookie}`);
  return [...row.querySelectorAll('td')].map((td) =>
    (td.textContent ?? '').replace(/\s+/g, ' ').trim(),
  );
}

describe('cookies page', () => {
  it('gives the session cookie the lifetime Auth.js is configured with', () => {
    render(<CookiesPage />);
    const days = SESSION_MAX_AGE_SECONDS / (24 * 60 * 60);
    expect(rowFor('authjs.session-token')[2]).toBe(`${days} days from when you sign in`);

    // The page reads the constant; this pins that the config does too.
    const config = readFileSync(path.resolve(__dirname, '../../../auth/config.ts'), 'utf8');
    expect(config).toMatch(/session:\s*\{[^}]*maxAge:\s*SESSION_MAX_AGE_SECONDS/);
  });

  it("lists Google sign-in's PKCE cookie", () => {
    render(<CookiesPage />);
    const [name, , lifetime] = rowFor('authjs.pkce.code_verifier');
    expect(name).toContain('__Secure-authjs.pkce.code_verifier');
    expect(lifetime).toBe('15 minutes');
  });
});
