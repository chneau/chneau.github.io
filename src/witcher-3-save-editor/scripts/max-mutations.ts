/**
 * Max every Blood-and-Wine mutation in a save.
 *
 * Usage: bun run src/witcher-3-save-editor/scripts/max-mutations.ts <in.sav> <out.sav>
 *
 * Applies the page's "Max all mutations" action. That action is a **resize**, not
 * a width-preserving edit: the `*Used` fields the engine recomputes from are
 * absent from the stream at zero, so they have to be inserted, and in some saves
 * `equippedMutation` has to be created too. This script used to say the opposite
 * — that it set `overallProgress` alone with no resizing — which stopped being
 * true when the action grew its real-insert path; the write still worked, so
 * nothing failed and the prose was the only thing left wrong.
 *
 * Read-only on the input; the output path is the only file written.
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
const working = applyEdits(doc, edits);
const file = await witcher3.encode(working);

// Read it back before writing it, which the page does and this script did not.
// Without this the only proof the resize was sound came from opening the result
// in the game — and the two resizing bugs found in review (an NPC's ability
// manager resized, and a chunk count the plan did not predict) both produced a
// file that decoded to a *different document* and would have been written here
// without a word.
const reread = await witcher3.decode(file);
if (JSON.stringify(reread) !== JSON.stringify(working)) {
	throw new Error(
		"the rebuilt save does not read back as the document that was edited; not writing it",
	);
}

writeFileSync(output, file);
console.log(
	`maxed ${edits.length} mutation(s) -> ${output} (${file.length} bytes), read back clean`,
);
