import { headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { requestedSignupLocale } from '@/app/s/[slug]/signup-locale';
import { SIGNUP_PATH_HEADER } from '@/lib/signup-path';
import { TIME_ZONE } from './time-zone';

/**
 * next-intl's request config. The plugin in next.config.mjs requires one, and
 * next-intl's own server functions (`getLocale`, `getFormatter` and the rest)
 * read it. Nothing calls those: server code takes a synchronous translator
 * from `getServerTranslator`, and client text comes through `ClientMessages`,
 * which is handed every prop, so this holds no messages.
 *
 * On a signup's pages, which the middleware marks with the path header
 * (`SIGNUP_PATH_HEADER`), it's the signup's language, as the pages there that
 * get no params read it (`requestedSignupLocale`), so anything that did call
 * them would agree with the page. Everywhere else it's English, in UTC, as
 * before: what an organizer's screens are in is `localeOfOrganizer`'s to say.
 */
export default getRequestConfig(async () => ({
  locale: (await headers()).has(SIGNUP_PATH_HEADER) ? await requestedSignupLocale() : 'en',
  timeZone: TIME_ZONE,
}));
