/**
 * Narrow away `undefined` for values that are present by construction.
 *
 * `noUncheckedIndexedAccess` types every index read as possibly missing even
 * when the surrounding bounds checks already prove otherwise. Prefer this over
 * a `!` assertion so a broken assumption fails with a named error instead of a
 * `TypeError` deep inside the parser.
 */
export const defined = <T>(value: T | undefined, what: string): T => {
	if (value === undefined) {
		throw new Error(`Missing ${what}`);
	}
	return value;
};
