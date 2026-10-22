// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { FormError, SuccessNotice } from './form-error';

afterEach(cleanup);

describe('<FormError />', () => {
  it('is an alert that can hold a suggestion and links under the message', () => {
    render(
      <FormError>
        <p>This slot is full.</p>
        <a href="https://example.com/">See alternatives</a>
      </FormError>,
    );
    const alert = screen.getByRole('alert');
    expect(alert.tagName).toBe('DIV');
    expect(alert).toContainElement(screen.getByRole('link', { name: 'See alternatives' }));
  });
});

describe('<SuccessNotice />', () => {
  it('is a status, in the same box as FormError', () => {
    render(<SuccessNotice>Saved.</SuccessNotice>);
    render(<FormError>Save failed.</FormError>);
    const box = (el: HTMLElement) =>
      [...el.classList].filter((c) => !/^(bg|text)-(danger|success)/.test(c));
    expect(box(screen.getByRole('status'))).toEqual(box(screen.getByRole('alert')));
    expect(screen.getByRole('status')).toHaveTextContent('Saved.');
  });
});
