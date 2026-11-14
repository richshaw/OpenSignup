// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

// Which languages have shipped to participants, per test. Only English has
// today, so the tests that need a choice ship a second one here.
const shipped = vi.hoisted(() => ({ participant: ['en'] as string[] }));
vi.mock('@/i18n/config', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/i18n/config')>();
  return {
    ...real,
    SHIPPED: {
      ...real.SHIPPED,
      get participant() {
        return shipped.participant;
      },
    },
  };
});
// Unit tests have no server environment; the instance sets no language.
vi.mock('@/i18n/server', () => ({ instanceDefaultLocale: () => undefined }));
// The server action, which needs the database and a session.
vi.mock('../actions', () => ({ setSignupLocaleAction: vi.fn() }));

const { SignupLanguageForm } = await import('./signup-language-form');

afterEach(() => {
  cleanup();
  shipped.participant = ['en'];
});

describe('<SignupLanguageForm />', () => {
  it('renders nothing while one language has shipped to participants', () => {
    const { container } = render(
      <SignupLanguageForm signupId="sig_1" stored={undefined} saved={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('offers each shipped language by its own name once there are two', () => {
    shipped.participant = ['en', 'sv'];
    render(<SignupLanguageForm signupId="sig_1" stored="sv" saved={false} />);

    const group = screen.getByRole('group', { name: 'Signup language' });
    expect(group).toBeInTheDocument();
    const english = screen.getByRole('radio', { name: 'English' });
    const swedish = screen.getByRole('radio', { name: 'Svenska' });
    expect(english).toHaveAttribute('value', 'en');
    expect(swedish).toHaveAttribute('value', 'sv');
    expect(english).toHaveAttribute('name', 'locale');
    // Each name is marked as its own language, for screen readers.
    expect(screen.getByText('Svenska')).toHaveAttribute('lang', 'sv');
    expect(swedish).toBeChecked();
    expect(english).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the instance’s language for a signup with none, or one that has left the list', () => {
    shipped.participant = ['en', 'sv'];
    render(<SignupLanguageForm signupId="sig_1" stored={undefined} saved={false} />);
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
    cleanup();

    render(<SignupLanguageForm signupId="sig_1" stored="xx" saved={false} />);
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Svenska' })).not.toBeChecked();
  });

  it('says Saved after its own save', () => {
    shipped.participant = ['en', 'sv'];
    render(<SignupLanguageForm signupId="sig_1" stored="en" saved />);
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });
});
