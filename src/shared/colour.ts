/**
 * The one WCAG colour implementation on the site.
 *
 * The same maths used to live twice — once in `design/App.tsx` for the live
 * audit, once in `shared/tests/contrast.test.ts` for the token suite — so a
 * change to one could silently disagree with the other. This module is the
 * single source of truth: the gallery and the test both consume it, and a fix
 * lands in exactly one place.
 *
 * The algorithms are copied verbatim from `design/App.tsx`, alpha compositing
 * included, so every ratio the audit reports and every ratio the test asserts
 * are numerically identical to before the extraction.
 *
 * Deliberately dependency-free and DOM-free: `parseColor` reads a colour
 * string, `composite` walks the source-over stack, and `luminance`/`ratio`
 * carry the WCAG 2.x maths. Anything that reads the document stays with the
 * caller, which is why `CANVAS` and the token readers are not here.
 */

/** An opaque colour, channels in 0–255. */
type Rgb = readonly [number, number, number];

/** A colour with an alpha channel, channels in 0–255 and alpha in 0–1. */
export type Rgba = readonly [number, number, number, number];

/** Parse the colour syntaxes this system actually emits. */
export const parseColor = (input: string): Rgba | undefined => {
	const value = input.trim().toLowerCase();
	if (value === "" || value === "transparent") return [0, 0, 0, 0];
	if (value === "currentcolor" || value === "none") return undefined;

	const hex = /^#([0-9a-f]{3,8})$/.exec(value);
	if (hex) {
		const digits = hex[1] ?? "";
		const pair = (index: number) =>
			parseInt(
				digits.length <= 4
					? (digits[index] ?? "0").repeat(2)
					: digits.slice(index * 2, index * 2 + 2),
				16,
			);
		if (digits.length === 3 || digits.length === 4) {
			return [
				pair(0),
				pair(1),
				pair(2),
				digits.length === 4 ? pair(3) / 255 : 1,
			];
		}
		if (digits.length === 6 || digits.length === 8) {
			return [
				pair(0),
				pair(1),
				pair(2),
				digits.length === 8 ? pair(3) / 255 : 1,
			];
		}
		return undefined;
	}

	const fn = /^(rgba?|color)\(([^)]*)\)$/.exec(value);
	if (!fn) return undefined;
	const parts = (fn[2] ?? "")
		.split(/[,/\s]+/)
		.map((part) => part.trim())
		.filter(Boolean);

	// `color(srgb 0 1 0.5 / 50%)` — channels are 0–1, not 0–255.
	const scale = fn[1] === "color" ? 255 : 1;
	const channel = (raw: string | undefined) => {
		if (raw === undefined) return 0;
		return raw.endsWith("%")
			? (Number.parseFloat(raw) / 100) * 255
			: Number.parseFloat(raw) * scale;
	};
	const alpha = (raw: string | undefined) => {
		if (raw === undefined) return 1;
		return raw.endsWith("%")
			? Number.parseFloat(raw) / 100
			: Number.parseFloat(raw);
	};

	if (fn[1] === "color") {
		return [
			channel(parts[0]),
			channel(parts[1]),
			channel(parts[2]),
			alpha(parts[3]),
		];
	}
	return [
		channel(parts[0]),
		channel(parts[1]),
		channel(parts[2]),
		alpha(parts[3]),
	];
};

/** Source-over composite of a translucent layer onto an opaque backdrop. */
export const composite = (top: Rgba, bottom: Rgba): Rgba => {
	const alpha = top[3] + bottom[3] * (1 - top[3]);
	if (alpha === 0) return [0, 0, 0, 0];
	return [
		(top[0] * top[3] + bottom[0] * bottom[3] * (1 - top[3])) / alpha,
		(top[1] * top[3] + bottom[1] * bottom[3] * (1 - top[3])) / alpha,
		(top[2] * top[3] + bottom[2] * bottom[3] * (1 - top[3])) / alpha,
		alpha,
	];
};

/** WCAG 2.x relative luminance. */
const luminance = (colour: Rgb): number => {
	const [r, g, b] = colour.map((channel) => {
		const c = channel / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	}) as [number, number, number];
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Contrast ratio between two resolved colours, 1..21. */
export const ratio = (a: Rgba, b: Rgba): number => {
	const l1 = luminance([a[0], a[1], a[2]]);
	const l2 = luminance([b[0], b[1], b[2]]);
	return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

/**
 * Contrast ratio between two colour strings, 1..21.
 *
 * A convenience over {@link ratio} for callers that hold colour strings rather
 * than parsed tuples — the token suite reads its values straight out of
 * `tokens.css` as text. Throws when either string is not a colour the system
 * understands, which is what the previous hex-only helper did.
 */
export const contrastRatio = (a: string, b: string): number => {
	const first = parseColor(a);
	const second = parseColor(b);
	if (!first || !second) {
		throw new Error(`not a colour: ${!first ? a : b}`);
	}
	return ratio(first, second);
};
