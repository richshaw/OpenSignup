// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BuildWysiwyg } from './BuildWysiwyg';
import type { SignupSettings } from '@/schemas/signups';

const settings: SignupSettings = {
  requireEmail: true,
  allowNotes: true,
  showWhoSignedUp: true,
  lockoutHoursBeforeSlot: 0,
  sendReminders: true,
  groupByFieldRefs: [],
};

const baseProps = {
  signupId: 'sig_t',
  signupMeta: {
    title: 'Sample',
    description: 'd',
    slug: 'sample',
    status: 'draft' as const,
  },
  initialFields: [],
  initialSlots: [],
  initialSettings: settings,
};

function findSheet(container: HTMLElement): HTMLElement | null {
  return container.querySelector('div[class*="border-t-brand"]');
}

describe('BuildWysiwyg — responsive sheet layout', () => {
  it('applies mobile-first full-bleed + md-clamp classes', () => {
    const { container } = render(<BuildWysiwyg {...baseProps} />);
    const sheet = findSheet(container);
    expect(sheet).toBeTruthy();
    const cls = sheet!.className;
    // Mobile: full-bleed, square corners.
    expect(cls).toMatch(/\bw-full\b/);
    expect(cls).toMatch(/\brounded-none\b/);
    // Desktop: max-width clamp + rounded corners.
    expect(cls).toMatch(/md:max-w-\[580px\]/);
    expect(cls).toMatch(/\bmd:rounded-xl\b/);
    // mx-auto for desktop centring.
    expect(cls).toMatch(/\bmx-auto\b/);
  });

  it('grows the desktop max-width with field count', () => {
    const make = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `f${i}`,
        ref: `f${i}`,
        label: `F${i}`,
        fieldType: 'text' as const,
        sortOrder: i,
        config: { fieldType: 'text' as const, maxLength: 200 },
      }));
    const four = render(<BuildWysiwyg {...baseProps} initialFields={make(4)} />);
    expect(findSheet(four.container)!.className).toMatch(/md:max-w-\[720px\]/);
    four.unmount();

    const six = render(<BuildWysiwyg {...baseProps} initialFields={make(6)} />);
    expect(findSheet(six.container)!.className).toMatch(/md:max-w-\[960px\]/);
  });
});
