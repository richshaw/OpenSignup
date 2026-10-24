// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WysiwygSlot } from '@/components/build-wysiwyg/WysiwygSlot';
import { Compose } from '@/components/magic-compose/Compose';
import { SharePanel } from '@/components/share/SharePanel';
import { UI } from './create-and-publish-a-signup.ui';

vi.mock('@/components/share/ShareQrCode', () => ({ ShareQrCode: () => null }));

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

// The walkthrough publishes once the slot is named, so the mark a published
// signup's slot gets is checked here, with a draft's.
describe('create-and-publish-a-signup: a slot that still says TBD', () => {
  it.each([
    ['draft', UI.stillSays],
    ['open', UI.peopleCanSee],
  ] as const)('is marked on a signup that is %s', (status, mark) => {
    const what = {
      id: 'f-what',
      ref: 'what',
      name: 'What',
      sortOrder: 0,
      config: { fieldType: 'text' as const, maxLength: 200 },
    };
    render(
      <WysiwygSlot
        row={{ id: 'slot_a', capacity: 2, sortOrder: 0, values: { what: 'TBD' } }}
        taken={0}
        remindersOn
        status={status}
        fields={[what]}
        displayFields={[what]}
        expanded={false}
        onExpand={() => {}}
        onCollapse={() => {}}
        onEditCell={() => {}}
        onSetCapacity={() => {}}
        onAddEnumOption={() => {}}
        onDuplicate={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText(mark, { exact: true })).toBeInTheDocument();
  });
});
