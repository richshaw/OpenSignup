// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Banner } from './banner';

describe('<Banner />', () => {
  it('puts an action in the text column, after the body', () => {
    render(
      <Banner
        kind="closed"
        live={false}
        title="Signup closed"
        body="People can’t sign up now."
        action={<button type="button">Reopen signup</button>}
      />,
    );
    const body = screen.getByText('People can’t sign up now.');
    const column = body.parentElement;
    const action = screen.getByRole('button', { name: 'Reopen signup' });
    // Under the text, not beside it at the banner's right edge.
    expect(column).toHaveClass('min-w-0', 'flex-1');
    expect(column).toContainElement(action);
    expect(body.compareDocumentPosition(action)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('renders the title and body alone when there is no action', () => {
    const { container } = render(
      <Banner kind="closed" title="Signup closed" body="People can’t sign up now." />,
    );
    const column = screen.getByText('Signup closed').parentElement;
    expect(column?.children).toHaveLength(2);
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('keeps Dismiss beside the text column, with or without an action', () => {
    const onDismiss = vi.fn();
    render(
      <Banner
        kind="aiDraft"
        title="Drafted with AI"
        body="Check it before you publish."
        onDismiss={onDismiss}
        live={false}
        action={<button type="button">Do it</button>}
      />,
    );
    const dismiss = screen.getByRole('button', { name: 'Dismiss' });
    const column = screen.getByText('Check it before you publish.').parentElement;
    expect(dismiss.parentElement).toBe(column?.parentElement);
    expect(column).not.toContainElement(dismiss);
    expect(dismiss).toHaveClass('flex-shrink-0');
    fireEvent.click(dismiss);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('takes an action only in a banner that isn’t a live region', () => {
    // A button's refusal is an alert, which mustn't sit inside role="status".
    // @ts-expect-error: a live banner takes no action.
    const live = <Banner kind="closed" title="T" body="B" action={<button type="button">X</button>} />;
    expect(live.props.action).toBeTruthy();
  });
});
