import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SESSION_MAX_AGE_SECONDS } from '@/auth/session-lifetime';
import CookiesPage from './page';

// The cells of the table row whose first cell names `cookie`, as plain text.
function rowFor(html: string, cookie: string): string[] {
  const rows = html.match(/<tr>.*?<\/tr>/g) ?? [];
  const row = rows.find((r) => r.includes(cookie));
  if (!row) throw new Error(`no row for ${cookie}`);
  return [...row.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((m) =>
    (m[1] ?? '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

describe('cookies page', () => {
  const html = renderToStaticMarkup(<CookiesPage />);

  it('gives the session cookie the lifetime Auth.js is configured with', () => {
    const days = SESSION_MAX_AGE_SECONDS / (24 * 60 * 60);
    expect(rowFor(html, 'authjs.session-token')[2]).toBe(
      `${days} days, renewed while you use the site`,
    );

    // The page reads the constant; this pins that the config does too.
    const config = readFileSync(path.resolve(__dirname, '../../../auth/config.ts'), 'utf8');
    expect(config).toMatch(/session:\s*\{[^}]*maxAge:\s*SESSION_MAX_AGE_SECONDS/);
  });

  it("lists Google sign-in's PKCE cookie", () => {
    const [name, , lifetime] = rowFor(html, 'authjs.pkce.code_verifier');
    expect(name).toContain('__Secure-authjs.pkce.code_verifier');
    expect(lifetime).toBe('15 minutes');
  });
});
