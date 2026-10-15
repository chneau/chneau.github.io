import { heapStats } from "bun:jsc";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decodeSave } from "../lib/save-engine/container";
import {
	readRoot,
	walkObjectList,
	walkObjectListColumns,
} from "../lib/save-engine/object-walk";

const name = process.argv[2] ?? "save.save";
const raw = (
	await decodeSave(
		new Uint8Array(readFileSync(join(import.meta.dir, "..", "saves", name))),
	)
).rawPayload;

const root = readRoot(raw, "QuestSaveData");
const field = root.fields.find(
	(candidate) => candidate.name === "_stageStateData" && candidate.present,
);
if (!field || field.start === undefined || field.end === undefined) {
	console.log(`${name}: no _stageStateData table, nothing to measure`);
	process.exit(0);
}

const liveObjects = (): number => {
	Bun.gc(true);
	return heapStats().objectCount;
};

walkObjectList(root.parser, field);
walkObjectListColumns(root.parser, field);

const before = liveObjects();
const walked = walkObjectList(root.parser, field);
const after = liveObjects();
const retainedObjects = after - before;

const beforeColumns = liveObjects();
const columns = walkObjectListColumns(root.parser, field);
const afterColumns = liveObjects();
const retainedColumns = afterColumns - beforeColumns;

console.log(
	`${name}: one walk of ${walked.length} elements retains ${retainedObjects} objects (${(
		retainedObjects / walked.length
	).toFixed(1)} per element)`,
);
console.log(
	`${name}: columnar walk of the same ${columns.count} elements retains ${retainedColumns} objects (${(
		retainedColumns / columns.count
	).toFixed(1)} per element)`,
);
