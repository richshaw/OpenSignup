import { getRequestConfig } from 'next-intl/server';
import { TIME_ZONE } from './time-zone';

/**
 * next-intl's request config. The plugin in next.config.mjs requires one, and
 * next-intl's own server functions read it. Nothing calls those: server code
 * takes a synchronous translator from `getServerTranslator` instead. English,
 * in UTC, until signups and organizers have a language of their own.
 */
export default getRequestConfig(async () => ({ locale: 'en', timeZone: TIME_ZONE }));
