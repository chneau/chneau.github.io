/**
 * Turn anything that was thrown into the message the UI shows.
 *
 * The engine throws `Error`s everywhere, but a `catch` still binds `unknown`:
 * a rejected promise can carry a string or an object just as easily. Every
 * boundary that reports a failure back to the page goes through here, so the
 * fallback wording stays identical across parse, edit and companion paths. It
 * lives in `shared/save/` because the Crimson engine was no longer its only
 * caller — the round-trip proof and the compression stream both needed it.
 */
export const describeError = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);
