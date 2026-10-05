/**
 * Where the `.ics` this app publishes can be fetched from, and how a `https`
 * URL becomes a `webcal` one.
 *
 * Separate from `CalendarActions.tsx` because these two are pure functions with
 * no DOM and no React: they are the part that is wrong in a way a status code
 * hides, and they are the part worth testing without a browser.
 */

/**
 * The URL of the file this app PUBLISHES at build time.
 *
 * It is addressed at the site ROOT, not under `/birthday/`. The birthday
 * environment's `distPath.root` is `dist/birthday`, so deriving the URL from
 * `location.pathname` yields `https://host/birthday/birthdays.ics`, which is
 * not where the file is canonically published: `public/birthdays.ics` is
 * emitted to the site root by `_genIcs.ts` and the root environment's build.
 * In development the SPA history fallback answers that path with
 * `index.html` and a 200, so "Download .ics" quietly saves an HTML page
 * instead of a calendar -- a failure the status code hides completely.
 *
 * The origin is a parameter so this is testable without a DOM, and so all
 * three hosted actions provably agree on one URL.
 */
export const hostedIcsUrl = (origin: string): string =>
	new URL("/birthdays.ics", origin).href;

/**
 * `webcal` is NOT a "special" scheme in the WHATWG URL spec, so assigning it to
 * `URL.protocol` is silently ignored and the URL stays `https:`. The scheme
 * substitution has to happen textually on the href.
 */
export const toWebcal = (httpsUrl: string): string =>
	httpsUrl.replace(/^https:/i, "webcal:");
