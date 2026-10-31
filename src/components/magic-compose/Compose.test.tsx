// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PROMPT_MAX_LENGTH } from '@/lib/magic-compose/limits';
import { Compose } from './Compose';

afterEach(cleanup);

function renderWith(prompt: string) {
  const onDraft = vi.fn();
  render(<Compose prompt={prompt} setPrompt={() => {}} onDraft={onDraft} />);
  return onDraft;
}

const draftButton = () => screen.getByRole('button', { name: /Draft my signup/ });

describe('Compose description limit', () => {
  it('shows no count well under the limit', () => {
    renderWith('Bake sale');
    expect(screen.queryByText(/\/ 4,000/)).not.toBeInTheDocument();
    expect(draftButton()).toBeEnabled();
  });

  it('shows the count near the limit and still drafts', () => {
    const onDraft = renderWith('a'.repeat(3700));
    expect(screen.getByText('3,700 / 4,000 characters')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveAccessibleDescription('3,700 / 4,000 characters');
    fireEvent.click(draftButton());
    expect(onDraft).toHaveBeenCalledOnce();
  });

  it('allows exactly the limit', () => {
    renderWith('a'.repeat(PROMPT_MAX_LENGTH));
    expect(draftButton()).toBeEnabled();
  });

  it('says how far over and disables Draft over the limit, Ctrl+Enter included', () => {
    const onDraft = renderWith('a'.repeat(4828));
    expect(
      screen.getByText('4,828 / 4,000 characters. Shorten it by 828 to draft.'),
    ).toBeInTheDocument();
    expect(draftButton()).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', ctrlKey: true });
    expect(onDraft).not.toHaveBeenCalled();
  });
});
