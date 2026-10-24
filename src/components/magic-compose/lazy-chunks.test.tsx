// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Drafting } from './Drafting';
import { MagicComposeRoot } from './MagicComposeRoot';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
// As after a deploy since the page opened: the chunks it asks for are gone.
vi.mock('./Questions', () => {
  throw new Error('Loading chunk failed');
});
vi.mock('./DraftingFrom', () => {
  throw new Error('Loading chunk failed');
});

let consoleError: MockInstance;
beforeEach(() => {
  // React logs each error a boundary catches; the tests check what's shown instead.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  consoleError.mockRestore();
});

describe('lazy parts of Magic Compose that fail to load', () => {
  it("says to reload when the questions can't load, with the description kept to copy", async () => {
    const questions = { topics: ['what'], whatOptions: ['Bake something', 'Staff the table'] };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ data: { questions } }), { status: 200 })),
    );
    render(<MagicComposeRoot />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Bake sale' } });
    fireEvent.click(screen.getByRole('button', { name: /Draft my signup/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "The questions couldn't be shown. Reload the page and try again; copy your description first if you want to keep it.",
    );
    expect(screen.getByRole('heading', { name: 'What are you organizing?' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Describe your signup' })).toHaveValue('Bake sale');
  });

  it("shows the description in place of the Drafting from card when that can't load", async () => {
    render(
      <Drafting
        prompt="Bake sale"
        followUp={{ what: { picked: ['Staff the table'], added: [] } }}
        draft={null}
        onCancel={() => {}}
        onAnimationDone={() => {}}
      />,
    );
    // The boundary has caught the failed import once React reports it.
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(screen.getByRole('heading', { name: 'Drafting your signup' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Your description' })).toHaveTextContent(
      '“Bake sale”',
    );
    expect(screen.queryByRole('region', { name: 'Drafting from' })).toBeNull();
  });
});
