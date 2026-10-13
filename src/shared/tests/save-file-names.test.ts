import { describe, expect, test } from "bun:test";
import { formatBytes, rebuiltName } from "../save/file";

describe("rebuiltName", () => {
	test("marks a rebuilt save without losing the extension", () => {
		expect(rebuiltName("save.sav")).toBe("save-edited.sav");
		expect(rebuiltName("profile.001.dat")).toBe("profile.001-edited.dat");
	});

	test("handles a name with no extension", () => {
		expect(rebuiltName("noext")).toBe("noext-edited");
	});

	// A leading dot is not an extension, so `-edited` belongs after the name and
	// before nothing — `.hidden-edited`, never `.hidden-edited.` and never a
	// name identical to the original, which would clobber it in the Downloads
	// folder without the user noticing.
	test("treats a dotfile as having no extension", () => {
		expect(rebuiltName(".hidden")).toBe(".hidden-edited");
	});

	test("never returns the input unchanged", () => {
		for (const name of ["save.sav", ".hidden", "noext", "a.b.c"]) {
			expect(rebuiltName(name)).not.toBe(name);
		}
	});
});

describe("formatBytes", () => {
	// The byte count is what tells a user whether they dropped the right file,
	// so the boundaries are asserted exactly rather than approximately.
	test("switches unit at each power of 1024", () => {
		expect(formatBytes(0)).toBe("0 B");
		expect(formatBytes(1023)).toBe("1023 B");
		expect(formatBytes(1024)).toBe("1.0 kB");
		expect(formatBytes(1024 * 1024)).toBe("1.00 MB");
		expect(formatBytes(1024 * 1024 * 1024)).toBe("1.00 GB");
	});
});
