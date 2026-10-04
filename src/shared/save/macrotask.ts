/**
 * Hands the main thread back to the browser.
 *
 * A macrotask rather than a microtask on purpose: a microtask is drained before
 * the browser paints, so the progress a long pass reports would never appear.
 * The save engines deliberately keep their work on the page's main thread
 * (ADR-0001, ADR-0003 — no worker, no second bundle), which is only defensible
 * if a pass over a few megabytes of save yields often enough that the tab is not
 * offered for termination. Every editor that decodes or rebuilds in chunks calls
 * this one; it was copied verbatim into each of them before it lived here.
 */
export const yieldToBrowser = (): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
