/**
 * Max every Blood-and-Wine mutation in a save.
 *
 * Usage: bun run src/witcher-3-save-editor/scripts/max-mutations.ts <in.sav> <out.sav>
 *
 * Applies the page's "Max all mutations" action: each mutation's
 * `overallProgress` becomes 100. The engine returns that value directly once it
 * is `>= 0` (`GetMutationResearchProgress`), so the mutation counts as
 * researched without touching the `*Used` fields — which are absent from the
 * stream anyway, so this is a width-preserving edit with no resizing. Read-only
 * on the input; the output path is the only file written.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { applyEdits } from "../../shared";
import { witcher3 } from "../lib/format";

const [input, output] = process.argv
	.slice(2)
	.filter((arg) => !arg.startsWith("--"));
if (input === undefined || output === undefined) {
	console.error("usage: max-mutations.ts <in.sav> <out.sav>");
	process.exit(1);
}

const doc = await witcher3.decode(new Uint8Array(readFileSync(input)));
const action = witcher3.actions.find((entry) => entry.id === "mutations-max");
if (action === undefined)
	throw new Error("this codec has no mutations-max action");
const edits = action.plan(doc);
const file = await witcher3.encode(applyEdits(doc, edits));
writeFileSync(output, file);
console.log(
	`maxed ${edits.length} mutation(s) -> ${output} (${file.length} bytes)`,
);
