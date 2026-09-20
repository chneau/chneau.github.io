/**
 * The picture layout.
 *
 * Every Item and Companion picture is published as a path in a generated table
 * and stored in one of two committed ZIP parts, which part going by the first
 * hexadecimal digit of the file name. The packer that split them was deleted
 * (`54e2cd3b`), so the parts cannot be rebuilt here and nothing about them is
 * self-evident: a regenerated table, or a part re-split by a different rule,
 * would leave every affected icon silently blank.
 *
 * So this checks the join the browser makes at runtime, without a DOM: for every
 * path in both tables, the part the rule picks really holds that entry, and the
 * committed parts really are the count the reader assumes. `readZipDirectory`
 * parses each part's central directory only, so nothing here inflates a picture
 * or looks at artwork bytes.
 *
 * Run with `bun test` (or `bun run check:test`, the same command with the
 * repository's parallel and timeout settings).
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type PictureKind, picturePath } from "../components/picture";
import companionPaths from "../lib/generated/companion-image-paths.json";
import itemPaths from "../lib/generated/item-image-paths.json";
import { ARCHIVE_COUNT, imagePart } from "../lib/image-archive";
import { readZipDirectory } from "../lib/zip-archive";

const root = join(import.meta.dir, "..");

/** The archives' own entry names carry no leading slash; the tables do. */
const entryName = (path: string) => path.replace(/^\//, "");

const part = (index: number) =>
	readZipDirectory(
		new Uint8Array(
			readFileSync(join(root, "assets", "image-archive", `part-${index}.zip`)),
		),
	);

const tables: Array<[PictureKind, Record<string, string>]> = [
	["item", itemPaths],
	["companion", companionPaths],
];

describe("the picture layout", () => {
	test("the committed parts are the number the reader assumes", () => {
		for (let index = 0; index < ARCHIVE_COUNT; index++) {
			expect(part(index).size, `part ${index}`).toBeGreaterThan(0);
		}
		// One more than the count is where the layout would be missing a part,
		// which is the failure a regenerated table could hide.
		expect(() => part(ARCHIVE_COUNT)).toThrow();
	});

	test("every published path is in the part the rule files it under", () => {
		const directories = new Map(
			Array.from({ length: ARCHIVE_COUNT }, (_, index) => [index, part(index)]),
		);
		const problems: string[] = [];
		for (const [kind, table] of tables) {
			const keys = Object.keys(table);
			expect(keys.length, `${kind} pictures published`).toBeGreaterThan(0);
			for (const key of keys) {
				const path = table[key];
				if (path === undefined) continue;
				const index = imagePart(entryName(path));
				if (!directories.get(index)?.has(entryName(path))) {
					problems.push(`${kind} ${key} → ${path} is not in part ${index}`);
					continue;
				}
				const resolved = picturePath(kind, key);
				if (resolved !== path) {
					problems.push(`${kind} ${key} resolves to ${resolved}`);
				}
			}
		}
		expect(problems).toEqual([]);
	});

	test("a key no table carries has no picture", () => {
		expect(picturePath("item", "no-such-key")).toBeUndefined();
		expect(picturePath("companion", -1)).toBeUndefined();
	});
});
