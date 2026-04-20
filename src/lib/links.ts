import { getEnv } from './env';

export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface LinkObject {
  href: string;
  method: Method;
}

export function link(href: string, method: Method = 'GET'): LinkObject {
  return { href, method };
}

export function publicSignupUrl(slug: string): string {
  const env = getEnv();
  return `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/s/${slug}`;
}

export function commitmentEditUrl(slug: string, commitmentId: string, token: string): string {
  const env = getEnv();
  return `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/s/${slug}/c/${commitmentId}?token=${token}`;
}
