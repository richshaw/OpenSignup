// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { CATALOG_LOCALES } from '@/i18n/config';
import { ship } from '@/i18n/testing/ship';
import type { ServiceError } from '@/lib/errors';
import { INSTANCE_NAME } from '@/lib/site-config';
import type { LoginForm as LoginFormType } from './login-form';

// The instance's DEFAULT_LOCALE, the sign-in providers it has set up, and
// what the rate limits and the code check answer.
const request = vi.hoisted(() => ({
  defaultLocale: undefined as string | undefined,
  providers: [] as { id: string; label: string }[],
  limited: [] as string[],
  redeemed: null as { ok: true; value: string } | { ok: false; error: unknown } | null,
}));
const charged = vi.hoisted(() => [] as { bucket: string; key: string }[]);
const redeemLoginCode = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ redirect: vi.fn(), useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('@/auth/config', () => ({ signIn: vi.fn() }));
vi.mock('@/auth/session', () => ({ getOrganizerSession: async () => null }));
vi.mock('@/auth/oauth-providers', () => ({ getEnabledOAuthProviders: () => request.providers }));
vi.mock('@/auth/request-context', () => ({ getCurrentRequestIp: async () => '203.0.113.7' }));
vi.mock('@/auth/login-code', () => ({ redeemLoginCode }));
vi.mock('@/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  chargeRateLimit: async (_db: unknown, limit: { bucket: string }, key: string) => {
    charged.push({ bucket: limit.bucket, key });
    return request.limited.includes(limit.bucket) ? { retryAfterSeconds: 60 } : null;
  },
}));
// English from the catalog; any other language answers with the key it was
// asked for and the language (`getTestServerTranslator`).
vi.mock('@/i18n/server', async () => {
  const { getTestServerTranslator } = await import('@/i18n/testing/translator');
  return {
    instanceDefaultLocale: () => request.defaultLocale,
    getServerTranslator: getTestServerTranslator,
  };
});
// The form as it is, with the props the page gave it kept for the tests of
// its server actions.
const formProps = vi.hoisted(() => ({
  current: null as ComponentProps<typeof LoginFormType> | null,
}));
vi.mock('./login-form', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./login-form')>();
  return {
    ...actual,
    LoginForm: (props: ComponentProps<typeof LoginFormType>) => {
      formProps.current = props;
      return <actual.LoginForm {...props} />;
    },
  };
});

const { default: LoginPage, generateMetadata } = await import('./page');

/** Every language with a catalog besides English, each tried in turn. */
const OTHER_LANGUAGES = CATALOG_LOCALES.filter((locale) => locale !== 'en');

async function renderPage(params: { error?: string; callbackUrl?: string } = {}) {
  const view = render(await LoginPage({ searchParams: Promise.resolve(params) }));
  return { frame: view.container.querySelector('[lang]') };
}

beforeEach(() => {
  request.defaultLocale = undefined;
  request.providers = [];
  request.limited = [];
  charged.length = 0;
  redeemLoginCode.mockReset();
  formProps.current = null;
});
afterEach(cleanup);

describe('the sign-in page', () => {
  it('is in English, word for word as it read before the catalog', async () => {
    const { frame } = await renderPage();
    expect(frame).toHaveAttribute('lang', 'en');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sign in to OpenSignup');
    expect(
      screen.getByText(
        "Enter your email and we'll send you a magic link to sign in. No passwords.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('placeholder', 'you@example.com');
    expect(screen.getByRole('button', { name: 'Send magic link' })).toBeInTheDocument();
    expect(screen.queryByText('or')).not.toBeInTheDocument();
    const footer = within(screen.getByRole('navigation', { name: 'Footer' }));
    expect(footer.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    expect(await generateMetadata()).toEqual({
      title: { absolute: `Sign in · ${INSTANCE_NAME}` },
      robots: { index: false },
    });
  });

  it('offers each sign-in provider the instance has set up, in English', async () => {
    request.providers = [{ id: 'google', label: 'Google' }];
    await renderPage();
    expect(
      screen.getByText(
        'Continue with a provider below, or get a magic link by email. No passwords.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(screen.getByText('or')).toBeInTheDocument();
  });

  it('says why the last link didn’t sign in, in English', async () => {
    await renderPage({ error: 'Verification' });
    expect(
      screen.getByText(
        'That sign-in link is no longer valid. It may have been used already or it may have expired. Request a new one below.',
      ),
    ).toBeInTheDocument();
    cleanup();
    await renderPage({ error: 'Configuration' });
    expect(screen.getByText('Something went wrong. Try again.')).toBeInTheDocument();
  });

  describe.each(OTHER_LANGUAGES)('with DEFAULT_LOCALE=%s', (other) => {
    it('stays English while that language hasn’t shipped to organizers', async () => {
      request.defaultLocale = other;
      const { frame } = await renderPage();
      expect(frame).toHaveAttribute('lang', 'en');
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sign in to OpenSignup');
      expect(await generateMetadata()).toMatchObject({
        title: { absolute: `Sign in · ${INSTANCE_NAME}` },
      });
    });

    it('is in that language once it has shipped to organizers', async () => {
      ship('organizer', ['en', other]);
      request.defaultLocale = other;
      request.providers = [{ id: 'google', label: 'Google' }];
      const { frame } = await renderPage({ error: 'Verification' });
      expect(frame).toHaveAttribute('lang', other);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        `auth.heading in ${other}`,
      );
      expect(screen.getByText(`auth.login.introWithProviders in ${other}`)).toBeInTheDocument();
      expect(screen.getByText(`auth.login.linkInvalid in ${other}`)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: `auth.login.continueWith in ${other}` }),
      ).toBeInTheDocument();
      expect(screen.getByText(`auth.login.or in ${other}`)).toBeInTheDocument();
      expect(screen.getByLabelText(`auth.form.email in ${other}`)).toHaveAttribute(
        'placeholder',
        `auth.form.emailPlaceholder in ${other}`,
      );
      expect(
        screen.getByRole('button', { name: `auth.form.send in ${other}` }),
      ).toBeInTheDocument();
      // The form's words for its code box and its refusals come with it.
      expect(formProps.current?.text.code.errors.wrong).toBe(`auth.code.errors.wrong in ${other}`);
      const footer = within(
        screen.getByRole('navigation', { name: `common.footer.label in ${other}` }),
      );
      expect(footer.getByRole('link', { name: `common.footer.privacy in ${other}` })).toBeVisible();
      expect(await generateMetadata()).toEqual({
        title: { absolute: `auth.tabTitle in ${other} · ${INSTANCE_NAME}` },
        robots: { index: false },
      });
    });

    // Nobody is signed in yet, so there's no account language to read, and
    // nothing comes from the browser.
    it('takes nothing from the e2e run’s unshipped languages', async () => {
      vi.stubEnv('E2E_UNSHIPPED_LOCALES', other);
      request.defaultLocale = other;
      const { frame } = await renderPage();
      expect(frame).toHaveAttribute('lang', 'en');
      vi.unstubAllEnvs();
    });
  });
});

describe('signing in with the code from the email', () => {
  /** The page's code action, as the form calls it, with `fields` as the form's. */
  async function redeem(fields: { email: string; code: string }) {
    await renderPage();
    const form = new FormData();
    form.set('email', fields.email);
    form.set('code', fields.code);
    const action = formProps.current?.redeem;
    if (!action) throw new Error('the page gave the form no code action');
    return action(form);
  }

  const refusal = (error: Partial<ServiceError>) => ({ ok: false, error });

  it('hands back the sign-in link for a code that’s right', async () => {
    redeemLoginCode.mockResolvedValue({ ok: true, value: 'http://localhost:3000/api/auth/cb' });
    expect(await redeem({ email: 'pat@example.com', code: '123456' })).toEqual({
      ok: true,
      url: 'http://localhost:3000/api/auth/cb',
    });
    expect(redeemLoginCode).toHaveBeenCalledWith({}, { email: 'pat@example.com', code: '123456' });
  });

  it('asks for a new link when the form has no address, charging nothing', async () => {
    expect(await redeem({ email: '', code: '123456' })).toEqual({ ok: false, reason: 'no_email' });
    expect(charged).toEqual([]);
    expect(redeemLoginCode).not.toHaveBeenCalled();
  });

  it('charges the IP’s tries first, then the address’s, before looking at the code', async () => {
    redeemLoginCode.mockResolvedValue({ ok: true, value: 'http://localhost:3000/api/auth/cb' });
    await redeem({ email: 'pat@example.com', code: '123456' });
    expect(charged).toEqual([
      { bucket: 'auth.code.ip', key: '203.0.113.7' },
      { bucket: 'auth.code.email', key: 'pat@example.com' },
    ]);
  });

  it('says to wait once either limit is reached, without looking at the code', async () => {
    request.limited = ['auth.code.ip'];
    expect(await redeem({ email: 'pat@example.com', code: '123456' })).toEqual({
      ok: false,
      reason: 'rate_limited',
    });
    // One client can't spend a victim's allowance per address.
    expect(charged.map(({ bucket }) => bucket)).toEqual(['auth.code.ip']);

    request.limited = ['auth.code.email'];
    expect(await redeem({ email: 'pat@example.com', code: '123456' })).toEqual({
      ok: false,
      reason: 'rate_limited',
    });
    expect(redeemLoginCode).not.toHaveBeenCalled();
  });

  it('words each refused code from its reason', async () => {
    const cases = [
      [{ code: 'already_consumed', details: { reason: 'code_expired' } }, 'expired'],
      [{ code: 'invalid_input', field: 'code', details: { reason: 'code_invalid' } }, 'wrong'],
      [{ code: 'invalid_input', field: 'code', details: { reason: 'code_malformed' } }, 'wrong'],
      [{ code: 'internal' }, 'wrong'],
    ] as const;
    for (const [error, reason] of cases) {
      redeemLoginCode.mockResolvedValueOnce(refusal(error));
      expect(await redeem({ email: 'pat@example.com', code: '12345' })).toEqual({
        ok: false,
        reason,
      });
      cleanup();
    }
  });
});
