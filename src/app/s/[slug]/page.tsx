import type { Metadata } from 'next';
import { renderSignupPage, signupPageMetadata } from './signup-page';

type PageParams = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  return signupPageMetadata((await params).slug, { embed: false });
}

/** A signup's own page, where participants sign up. */
export default async function PublicSignupPage({ params }: PageParams) {
  return renderSignupPage((await params).slug, { embed: false });
}
