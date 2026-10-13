/**
 * One app, one key, one label — and the label is not written out.
 *
 * `APP_META` used to carry both `hotkey` (the `KeyboardEvent.key` the keydown
 * handler compares against) and `shortcutKey` (the prose the card and the
 * command palette print). Nothing connected them. A row could ship `Press Q`
 * next to `hotkey: "e"`, and every gate stayed green: the card would advertise
 * one key, the palette another, and the dashboard would open a third app —
 * a shortcut that looks real and does nothing.
 *
 * `apps.tsx` now derives the label from the key, so `hotkey` is the only
 * hand-maintained half. These tests are the other half of that promise: they
 * assert the derivation holds for every row, that no two apps claim the same
 * key, and that the key is something a `KeyboardEvent` can actually produce.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { APP_META } from "../app-meta";
import { ALL_APPS, APPS, hotkeyLabel } from "../apps";

/** Either one printable character or a named key such as `Home`. */
const KEY =
	/^(?:[a-z0-9]|Alt|Backspace|Delete|End|Enter|Escape|Home|PageDown|PageUp)$/i;

describe("app hotkeys", () => {
	test("every entry's advertised label is derived from its key", () => {
		for (const app of ALL_APPS) {
			expect(app.shortcutKey, app.href).toBe(hotkeyLabel(app.hotkey));
		}
	});

	test("each label names the key a visitor actually presses", () => {
		for (const app of ALL_APPS) {
			// The keydown handler compares case-insensitively, because
			// `event.key` is capitalised under Shift or Caps Lock, so the label
			// and the comparison have to agree on the same letter.
			const key = app.hotkey.toLowerCase();
			expect(
				app.shortcutKey.toLowerCase().endsWith(key),
				`${app.href}: "${app.shortcutKey}" does not mention "${app.hotkey}"`,
			).toBe(true);
		}
	});

	test("every hotkey is a key the browser can report", () => {
		for (const app of ALL_APPS) {
			expect(app.hotkey, app.href).toMatch(KEY);
		}
	});

	test("no two apps claim the same hotkey", () => {
		const seen = new Map<string, string>();
		for (const app of ALL_APPS) {
			const key = app.hotkey.toLowerCase();
			const clash = seen.get(key);
			expect(
				clash,
				`${app.href} and ${clash} share "${app.hotkey}"`,
			).toBeUndefined();
			seen.set(key, app.href);
		}
	});

	test("the registry covers every APP_META row, hub first", () => {
		expect(ALL_APPS).toHaveLength(APP_META.length);
		expect(APP_META[0]?.slug).toBe("root");
		expect(ALL_APPS.map((app) => app.href)).toEqual(
			APP_META.map((meta) => meta.path),
		);
		expect(APPS).toHaveLength(APP_META.length - 1);
	});

	test("the dashboard resolves the hub key from the registry", () => {
		// A local `const HUB_HOTKEY = "0"` in the hook was the second place the
		// hub's key was written down, and its comment said the registry was "not
		// ours to change" — a rule that reads as permission for the two to drift.
		const hook = readFileSync(
			new URL("../../root/useDashboardShortcuts.ts", import.meta.url),
			"utf8",
		);
		expect(hook).toContain("ALL_APPS");
		expect(hook).not.toMatch(/HUB_HOTKEY/);
	});
});
