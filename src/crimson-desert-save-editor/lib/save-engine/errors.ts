/**
 * Turn anything that was thrown into the message the UI shows.
 *
 * The engine throws `Error`s everywhere, but a `catch` still binds `unknown`:
 * a rejected promise can carry a string or an object just as easily. Every
 * boundary that reports a failure back to the page goes through here, so the
 * fallback wording stays identical across parse, edit and companion paths.
 */
export const describeError = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);
