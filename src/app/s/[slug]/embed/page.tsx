import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { embedsEnabled } from '@/lib/env';
import { renderSignupPage, signupPageMetadata } from '../signup-page';

type PageParams = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  if (!embedsEnabled()) notFound();
  return signupPageMetadata((await params).slug, { embed: true });
}

/**
 * A signup's sheet for showing inside another website's page, in an
 * `<iframe>`. It's the only address `next.config.mjs` lets another site frame.
 * The layout leaves the site footer off it (`isEmbedPath`). With
 * `EMBEDS_ENABLED=false` it's not found, read per request since a
 * self-hoster's image is built without their env.
 */
export default async function EmbeddedSignupPage({ params }: PageParams) {
  if (!embedsEnabled()) notFound();
  return renderSignupPage((await params).slug, { embed: true });
}
