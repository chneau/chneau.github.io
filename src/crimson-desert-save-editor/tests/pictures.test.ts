import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type PictureKind, picturePath } from "../components/picture-path";
import companionPaths from "../lib/generated/companion-image-paths.json";
import itemPaths from "../lib/generated/item-image-paths.json";
import { ARCHIVE_COUNT, imagePart } from "../lib/image-archive";
import { readZipDirectory } from "../lib/zip-archive";

const root = join(import.meta.dir, "..");

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
