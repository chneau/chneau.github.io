import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type NameTable = Readonly<Record<string, string>>;

const pattern = (prefix: string) =>
	new RegExp(`^${prefix}_(\\d+)_name="(.*)"\\s*$`);

const readNames = (path: string, prefix: string): NameTable => {
	const matcher = pattern(prefix);
	const names = new Map<number, string>();
	for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
		const match = matcher.exec(line);
		if (!match) continue;
		const id = Number(match[1]);
		const name = match[2];
		if (!Number.isInteger(id) || name === undefined) continue;
		if (names.has(id)) {
			throw new Error(`Duplicate ${prefix} id ${id} in ${path}`);
		}
		names.set(id, name);
	}
	return Object.fromEntries(
		[...names.entries()]
			.sort(([left], [right]) => left - right)
			.map(([id, name]) => [String(id), name]),
	);
};

const locale = process.argv[2];
if (!locale) {
	throw new Error(
		"Pass the Chronicon locale folder, for example .../locale/EN",
	);
}

const output = {
	schema_version: 1,
	source: "Chronicon 1.62.1 locale EN",
	generated_by: "scripts/build-item-names.ts",
	items: readNames(join(locale, "items"), "item"),
	enchants: readNames(join(locale, "enchants"), "enchant"),
};

const destination = join(
	import.meta.dir,
	"..",
	"lib",
	"generated",
	"names.json",
);

writeFileSync(destination, `${JSON.stringify(output, null, "\t")}\n`);
console.log(
	`names.json written: ${Object.keys(output.items).length} items, ${Object.keys(output.enchants).length} enchants`,
);
