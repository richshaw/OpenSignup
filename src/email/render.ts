import { render } from '@react-email/components';
import type { ReactElement } from 'react';

export async function renderEmail(node: ReactElement) {
  const [html, text] = await Promise.all([
    render(node),
    render(node, { plainText: true }),
  ]);
  return { html, text };
}
