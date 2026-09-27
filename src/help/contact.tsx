import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '@/lib/site-config';

export function HelpContact() {
  return (
    <p className="text-sm text-ink-muted">
      Can&apos;t find what you need? Email{' '}
      <a href={SUPPORT_MAILTO} className="text-brand underline">
        {SUPPORT_EMAIL}
      </a>
      .
    </p>
  );
}
