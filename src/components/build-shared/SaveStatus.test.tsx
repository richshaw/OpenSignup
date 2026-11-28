// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { render as renderUi, screen } from '@testing-library/react';
import { SaveStatus } from './SaveStatus';
import type { ReactElement } from 'react';
import { englishMessages, standInMessages } from '@/i18n/testing/client-messages';
import { BUILD_TAB_NAMESPACES } from '@/components/build-wysiwyg/client-namespaces';

/** Renders `ui` with the Build tab's messages in English, as its page gives them. */
const wrapper = englishMessages(BUILD_TAB_NAMESPACES);
const render = (ui: ReactElement) => renderUi(ui, { wrapper });

describe('<SaveStatus />', () => {
  // A viewer never had edit access, so nothing says they lost it.
  it('tells a viewer whose save was refused that they have no edit access', () => {
    render(<SaveStatus status={{ kind: 'error', code: 'forbidden' }} />);
    expect(screen.getByRole('status')).toHaveTextContent("You don't have edit access.");
  });

  it('words a refusal by its reason, when it has one the tab words itself', () => {
    render(
      <SaveStatus
        status={{
          kind: 'error',
          code: 'invalid_input',
          details: { reason: 'slot_ids_mismatch' },
        }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      "The slots changed in another window, so your move wasn't saved. Drag it again.",
    );
  });

  it('says Saving… and Saved', () => {
    const { rerender } = render(<SaveStatus status={{ kind: 'saving' }} />);
    expect(screen.getByText('Saving…')).toBeInTheDocument();
    rerender(<SaveStatus status={{ kind: 'saved' }} />);
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('takes each line from the messages its page gives, in their language', () => {
    const { container, rerender } = renderUi(<SaveStatus status={{ kind: 'saving' }} />, {
      wrapper: standInMessages('sv', BUILD_TAB_NAMESPACES),
    });
    expect(container).toHaveTextContent(/^organizer\.build\.rail\.saving in sv$/);
    rerender(<SaveStatus status={{ kind: 'saved' }} />);
    expect(container).toHaveTextContent(/^organizer\.saveNotice\.saved in sv$/);
    rerender(<SaveStatus status={{ kind: 'error', code: 'forbidden' }} />);
    expect(container).toHaveTextContent(/^organizer\.errors\.code\.forbidden in sv$/);
    rerender(
      <SaveStatus
        status={{ kind: 'error', code: 'invalid_input', details: { reason: 'slot_ids_mismatch' } }}
      />,
    );
    expect(container).toHaveTextContent(/^organizer\.build\.refusal\.slotsMoved in sv$/);
  });
});
