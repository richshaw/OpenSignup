// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Compose } from '@/components/magic-compose/Compose';
import { Questions } from '@/components/magic-compose/Questions';
import { SharePanel } from '@/components/share/SharePanel';
import { UI } from './create-and-publish-a-signup.ui';

vi.mock('@/components/share/ShareQrCode', () => ({ ShareQrCode: () => null }));

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
    expect(screen.getByRole('button', { name: UI.draftCompose })).toBeInTheDocument();
  });
});

// The walkthrough's browser has no share menu, so Share… is checked here.
describe('create-and-publish-a-signup: a phone’s share menu', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'share');
  });

  it('offers Share… in place of Copy message and Email it', () => {
    Object.defineProperty(navigator, 'share', { value: async () => {}, configurable: true });
    render(
      <SharePanel
        variant="phone"
        firstTime
        signupId="sig_1"
        title="Snack duty — Spring season"
        url="https://your-site.example/s/snack-duty-spring-season"
        message="Snack duty — Spring season"
        onMessageChange={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: UI.shareOnPhone })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: UI.copyLink })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: UI.copyMessage })).toBeNull();
    expect(screen.queryByRole('link', { name: UI.emailIt })).toBeNull();
  });
});
