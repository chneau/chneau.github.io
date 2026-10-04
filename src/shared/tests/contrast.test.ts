/**
 * WCAG contrast for the text tokens, in both colour schemes.
 *
 * This exists because `--app-text-faint` shipped at 4.40:1 on `--app-bg` and
 * 3.99:1 on `--app-surface-3` - a WCAG AA failure for normal text, which needs
 * 4.5:1. It was used as `color:` in nine places, so it was real text rather
 * than decoration, and two independent audits had to find it before anyone
 * fixed it. A number in a token file is exactly the kind of value that rots
 * silently, so it gets checked rather than trusted.
 *
 * Ratios are computed here rather than hardcoded, so changing a token without
 * fixing the contrast fails this test instead of quietly shipping. The maths
 * itself lives in `shared/colour.ts`, shared with the gallery's live audit, so
 * the two can never drift into disagreeing.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { contrastRatio } from "../colour";

const css = readFileSync(new URL("../tokens.css", import.meta.url), "utf8");

/**
 * Every `--app-*: <hex>;` declaration, in source order. The file declares the
 * light scheme first and then re-declares the same names inside a dark-scheme
 * block, so grouping by scheme means splitting on the second occurrence.
 */
const declarations = (): { name: string; value: string }[] => {
	const out: { name: string; value: string }[] = [];
	for (const line of css.split("\n")) {
		const match = /^\s*(--app-[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/.exec(
			line,
		);
		if (match?.[1] && match[2]) out.push({ name: match[1], value: match[2] });
	}
	return out;
};

const all = declarations();
/** A token declared once is light-only; twice means light then dark. */
const byName = new Map<string, string[]>();
for (const { name, value } of all) {
	const list = byName.get(name) ?? [];
	list.push(value);
	byName.set(name, list);
}

const scheme = (name: string, index: number): string | undefined =>
	byName.get(name)?.[index];

describe("text token contrast", () => {
	// Text on the two surfaces it is actually used on. `--app-surface-3` is the
	// harsher of the two in light mode, so it is the one that decides.
	// Index 0 is the light declaration, index 1 the dark one, for BOTH the
	// foreground and the background - so a dark-scheme case is `[x, 1, 1]`.
	// Getting this wrong is easy and silently tests the wrong pairing: the
	// first version of this table "found" two failures that were really light
	// text measured against a dark background.
	const CASES: readonly (readonly [string, number, number])[] = [
		["--app-text", 0, 0],
		["--app-text-muted", 0, 0],
		["--app-text-faint", 0, 0],
		["--app-text", 1, 1],
		["--app-text-muted", 1, 1],
		["--app-text-faint", 1, 1],
	];

	for (const [name, fgIndex, bgIndex] of CASES) {
		const which = bgIndex === 0 ? "light" : "dark";
		test(`${name} on ${which} background meets WCAG AA (4.5:1)`, () => {
			const fg = scheme(name, fgIndex);
			const bg = byName.get("--app-bg")?.[bgIndex];
			expect(fg).toBeDefined();
			expect(bg).toBeDefined();
			if (!fg || !bg) return;
			expect({
				token: name,
				ratio: Number(contrastRatio(fg, bg).toFixed(2)),
			}).toEqual({
				token: name,
				ratio: expect.any(Number),
			});
			expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
		});
	}

	test("every text token is defined in both schemes", () => {
		for (const name of ["--app-text", "--app-text-muted", "--app-text-faint"]) {
			expect({ name, count: byName.get(name)?.length }).toEqual({
				name,
				count: 2,
			});
		}
	});

	test("the text hierarchy stays ordered: text > muted > faint", () => {
		// A fix for the contrast failure must not flatten the three-step ramp
		// into one indistinguishable shade.
		for (const index of [0, 1]) {
			const which = index === 0 ? "light" : "dark";
			const text = scheme("--app-text", index);
			const muted = scheme("--app-text-muted", index);
			const faint = scheme("--app-text-faint", index);
			if (!text || !muted || !faint) throw new Error(`missing ${which} token`);
			const bg = byName.get("--app-bg")?.[index];
			if (!bg) throw new Error(`missing ${which} --app-bg`);
			const onText = contrastRatio(text, bg);
			const onMuted = contrastRatio(muted, bg);
			const onFaint = contrastRatio(faint, bg);
			expect({
				which,
				ordered: onText > onMuted && onMuted > onFaint,
			}).toEqual({ which, ordered: true });
		}
	});
});
