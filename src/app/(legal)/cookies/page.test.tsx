// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SESSION_MAX_AGE_SECONDS } from '@/auth/session-lifetime';
import { PREFILL_KEY } from '@/app/s/[slug]/prefill-key';
import { DAYS_AFTER_SLOT, MAX_DAYS, MIN_DAYS } from '@/lib/returning-participant';
import { OAUTH_TTL } from '@/oauth/config';
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

  it("names the sign-up form's saved details by their real key", () => {
    render(<CookiesPage />);
    expect(PREFILL_KEY).toBe('opensignup:lastCommit');
    expect(screen.getByText(PREFILL_KEY).tagName).toBe('CODE');
  });

  it('gives os_commit the lifetime the participant cookie is written with', () => {
    render(<CookiesPage />);
    expect(DAYS_AFTER_SLOT).toBe(7); // the page says "a week"
    expect(rowFor('os_commit')[2]).toBe(
      `${MIN_DAYS} days, or until a week after the latest slot it holds if that is later (at most ${MAX_DAYS} days)`,
    );
  });

  it('gives the OAuth cookies the lifetimes the provider is configured with', () => {
    render(<CookiesPage />);
    expect(rowFor('os_oauth_session')[2]).toBe(`${OAUTH_TTL.SESSION / 3600} hours`);
    // oidc-provider sets the resume cookie with the interaction TTL too.
    const interaction = `${OAUTH_TTL.INTERACTION / 60} minutes`;
    expect(rowFor('os_oauth_interaction')[2]).toBe(interaction);
    expect(rowFor('os_oauth_resume')[2]).toBe(interaction);
  });
});
