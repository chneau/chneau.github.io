/**
 * Reading `var()` fallbacks out of CSS source.
 *
 * Extracted from `tokens-theme.test.ts` so it can be tested directly. The rule it
 * exists to enforce is that every token read carries a fallback or is provided by
 * the site — and the checker that enforces it had its own parser bug, which is
 * the worst place for one: a rule that can pass wrongly is worse than no rule,
 * because it is believed.
 *
 * ## The bug this fixes
 *
 * The original scanner found the end of a `var(` with `source.indexOf(")", i)`,
 * which returns the first closing paren — the *inner* one for a nested fallback.
 * For `var(--a, var(--b, c))` it read a body of `var(--b, c`, decided `--a` had a
 * fallback (correct), pushed a frame, and then let the leftover `)` characters
 * pop the stack at the wrong offsets. A fallback read could therefore inherit
 * "no fallback" from a parent that had one, and a real missing fallback could
 * read as covered.
 *
 * The fix matches the closing paren by depth, and recurses into the body so a
 * nested read is recorded in its own right with its own fallback status.
 */

type Usage = {
	token: string;
	file: string;
	/**
	 * `true` when the read is safe without the site providing the token: it
	 * supplies its own fallback, or it sits inside a read that does.
	 */
	hasFallback: boolean;
};

/** The token name a `var(` body starts with, e.g. `--app-accent` from ` --app-accent, red`. */
const TOKEN_NAME = /^--[a-zA-Z0-9_-]+/;

/**
 * The index of the `)` closing the `(` at `open`, or `-1`.
 *
 * Counted rather than searched, because a fallback may itself be a `var(...)`.
 */
const matchingParen = (source: string, open: number): number => {
	let depth = 0;
	for (let i = open + 1; i < source.length; i += 1) {
		if (source[i] === "(") depth += 1;
		else if (source[i] === ")") {
			depth -= 1;
			if (depth === 0) return i;
		}
	}
	return -1;
};

const scan = (
	text: string,
	file: string,
	inheritedFallback: boolean,
	found: Usage[],
): void => {
	for (let i = 0; i < text.length; i += 1) {
		if (!text.startsWith("var(", i)) continue;

		const close = matchingParen(text, i);
		const body = text.slice(i + 4, close === -1 ? text.length : close);

		const name = body.trimStart().match(TOKEN_NAME)?.[0];
		// A comma followed by anything means a fallback was supplied.
		const ownFallback = /,\s*\S/.test(body);
		if (name !== undefined) {
			found.push({
				token: name,
				file,
				hasFallback: ownFallback || inheritedFallback,
			});
		}

		// A nested read is a real reference and is recorded as one. It inherits
		// this read's fallback status, so `var(--a, var(--b))` treats `--b` as
		// covered: if `--a` resolves there is no need for `--b`.
		scan(body, file, ownFallback || inheritedFallback, found);

		// Resume after this whole `var(...)`; nested reads were handled above.
		if (close === -1) return;
		i = close;
	}
};

/**
 * Every `var()` read in `source`, in document order.
 *
 * @param file only used to label the results, so a failure names its stylesheet.
 */
export const collectUsages = (source: string, file: string): Usage[] => {
	const found: Usage[] = [];
	scan(source, file, false, found);
	return found;
};
