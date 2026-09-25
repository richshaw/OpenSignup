// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Compose } from '@/components/magic-compose/Compose';
import { UI } from './create-and-publish-a-signup.ui';

// The walkthrough can't reach the drafting screen (CI runs without an LLM), so
// the names the article's note uses for it are checked here instead.
describe('create-and-publish-a-signup: drafting screen names', () => {
  it('matches what the drafting screen shows', () => {
    render(<Compose prompt="" setPrompt={() => {}} onDraft={() => {}} />);
    expect(screen.getByRole('heading', { name: UI.composeHeading })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: UI.draftCompose })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: UI.skipCompose })).toBeInTheDocument();
  });
});
