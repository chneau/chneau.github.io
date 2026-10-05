/**
 * Add items to a Witcher 3 save.
 *
 * Usage:
 *   bun run src/witcher-3-save-editor/scripts/add-item.ts <in.sav> <out.sav> \
 *     --item "Greater mutagen red:50" --item "Greater mutagen green:50" \
 *     [--template "Greater mutagen blue"]
 *
 * This is the writer's one resizing operation: it appends names to `MANU`, inserts
 * native inventory records and repairs the frame sizes, the `SC` span index and
 * the container. See `lib/add-item.ts`. It reads the input and writes a **new**
 * file; the input is never modified.
 *
 * Read-only on the input; the output path is the only file written.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { addItems } from "../lib/add-item";
import { decompressContainer } from "../lib/container";

const args = process.argv.slice(2);
const positional = args.filter((arg) => !arg.startsWith("--"));
const flagValue = (flag: string): string | undefined => {
	const index = args.indexOf(flag);
	return index >= 0 ? args[index + 1] : undefined;
};
const items: string[] = [];
for (let i = 0; i < args.length; i += 1) {
	if (args[i] === "--item" && args[i + 1] !== undefined)
		items.push(args[i + 1] ?? "");
}

const [input, output] = positional;
if (input === undefined || output === undefined || items.length === 0) {
	console.error(
		'usage: add-item.ts <in.sav> <out.sav> --item "Name:qty" [--item ...] [--template "Name"]',
	);
	process.exit(1);
}

const requests = items.map((spec) => {
	const colon = spec.lastIndexOf(":");
	const itemName = colon > 0 ? spec.slice(0, colon) : spec;
	const quantity = colon > 0 ? Number.parseInt(spec.slice(colon + 1), 10) : 1;
	if (!Number.isFinite(quantity) || quantity < 1) {
		throw new Error(`bad quantity in "${spec}"`);
	}
	return { name: itemName, quantity, template: flagValue("--template") };
});

const container = decompressContainer(new Uint8Array(readFileSync(input)));
const file = addItems(container, requests);
writeFileSync(output, file);
console.log(
	`added ${requests.length} item(s) to ${output} (${file.length} bytes): ${requests
		.map((r) => `${r.name} x${r.quantity}`)
		.join(", ")}`,
);
