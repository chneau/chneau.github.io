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
