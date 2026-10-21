// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { SignInLink } from './sign-in-link';

const href = 'http://localhost:3000/api/auth/callback/nodemailer?token=not-a-real-token';

function renderLink() {
  render(<SignInLink href={href} />);
  return screen.getByRole('link');
}

// Records whether the link let each click through, then stops the navigation
// itself, which jsdom can't do. Runs after React's own listener on the root.
let followed: boolean[] = [];
function stopNavigation(event: Event) {
  followed.push(!event.defaultPrevented);
  event.preventDefault();
}
beforeEach(() => {
  followed = [];
  window.addEventListener('click', stopNavigation);
});
afterEach(() => {
  window.removeEventListener('click', stopNavigation);
});

/** Clicks the link and reports whether the browser would have followed it. */
function click(link: HTMLElement, init: MouseEventInit = {}) {
  fireEvent.click(link, { button: 0, ...init });
  return followed.at(-1);
}

describe('<SignInLink />', () => {
  it('is a plain link to the callback until it is clicked', () => {
    const link = renderLink();
    expect(link).toHaveAttribute('href', href);
    expect(link).toHaveTextContent('Sign in →');
    expect(link).not.toHaveAttribute('aria-disabled');
  });

  it('lets the first click navigate, then shows that sign-in has started', () => {
    const link = renderLink();
    expect(click(link)).toBe(true);
    expect(link).toHaveTextContent('Signing in…');
    expect(link).toHaveAttribute('aria-disabled', 'true');
  });

  it('ignores a second click, which would reuse the single-use token', () => {
    const link = renderLink();
    click(link);
    expect(click(link)).toBe(false);
  });

  it('leaves a modified or middle click alone', () => {
    const link = renderLink();
    expect(click(link, { metaKey: true })).toBe(true);
    expect(click(link, { ctrlKey: true })).toBe(true);
    expect(click(link, { button: 1 })).toBe(true);
    expect(link).toHaveTextContent('Sign in →');
  });

  it('starts over when the page comes back from the back-forward cache', () => {
    const link = renderLink();
    click(link);
    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    expect(link).toHaveTextContent('Sign in →');
    expect(click(link)).toBe(true);
  });
});
