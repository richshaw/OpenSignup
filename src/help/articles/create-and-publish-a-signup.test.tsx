// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Compose } from '@/components/magic-compose/Compose';
import { Questions } from '@/components/magic-compose/Questions';
import { UI } from './create-and-publish-a-signup.ui';

// The walkthrough can't reach the drafting screens (CI runs without an LLM), so
// the names the article's note uses for them are checked here instead.
describe('create-and-publish-a-signup: drafting screen names', () => {
  it('matches what the drafting screen shows', () => {
    render(<Compose prompt="" setPrompt={() => {}} onDraft={() => {}} />);
    expect(screen.getByRole('heading', { name: UI.composeHeading })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: UI.draftCompose })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: UI.skipCompose })).toBeInTheDocument();
  });

  it('matches what the questions screen shows', () => {
    render(
      <Questions
        prompt="Bake sale"
        questions={{ topics: ['what'], whatOptions: ['Bake something to sell', 'Staff the table'] }}
        answers={null}
        setAnswers={() => {}}
        error={null}
        onBack={() => {}}
        onSend={() => {}}
        onInvalid={() => {}}
      />,
    );
    expect(screen.getByRole('heading', { name: UI.questionsHeading })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: UI.draftWithPlaceholders })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: UI.draftCompose })).toBeInTheDocument();
  });
});
