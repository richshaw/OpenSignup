/**
 * The time zone every translator formats dates in. Slot dates and times are
 * wall-clock values with no zone of their own, so formatting them in the
 * server's or the browser's zone could move them to another day.
 *
 * Kept apart from `config.ts` because browser code imports it, through
 * `src/lib/slot-label.ts`. Webpack counts a module's unused code too when it
 * decides whether shared code gets a chunk of its own, and with config.ts's
 * language rules counted it made one, which added bytes to every page.
 */
export const TIME_ZONE = 'UTC';
