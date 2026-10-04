/**
 * The axe configuration every DOM suite in this repository shares.
 *
 * Eight rules were disabled, by name, in each of the a11y suites — and the list
 * had already drifted: six files carried it as an array, two more spelled the
 * same eight out inline as an object literal, and one of those wrote them
 * longhand. Nine copies of a list whose whole purpose is to say "these rules do
 * not apply to a fragment rendered in isolation", with nothing asserting the
 * copies agree.
 *
 * Shared here so there is one list, and so a rule added here is added once.
 * The rationale for disabling them at all is not repeated per file:
 *
 *   - `color-contrast`, `region`, `landmark-one-main`, `page-has-heading-one`,
 *     `bypass`, `html-has-lang`, `document-title`, `meta-viewport` are all
 *     properties of a *document*, and these suites render a component into a
 *     detached container. The page-level equivalents are covered by the design
 *     app's own audit (`src/design/audit.ts`), which composites translucency and
 *     reads the resolved focus ring — things axe cannot do.
 *   - `bypass` is not merely inapplicable to a fragment: `SkipLink` is the
 *     document-level answer to it and is tested on its own in
 *     `skip-link.test.tsx`.
 */

/** The rules these fragment-level runs turn off. */
const AXE_FRAGMENT_RULES = [
	"color-contrast",
	"page-has-heading-one",
	"landmark-one-main",
	"region",
	"html-has-lang",
	"document-title",
	"bypass",
	"meta-viewport",
] as const;

/**
 * Ready to spread into `axe.run(el, …)`.
 *
 * Returns a fresh object each call because axe mutates the shape it is handed,
 * and a shared literal across files running in one process is a way to find that
 * out the hard way.
 */
export const axeFragmentOptions = (): {
	rules: Record<string, { enabled: boolean }>;
} => ({
	rules: Object.fromEntries(
		AXE_FRAGMENT_RULES.map((id) => [id, { enabled: false }]),
	),
});
