/**
 * Allocation benchmark: objects retained by one walk of the biggest table.
 *
 * Wall-clock cannot resolve an allocation regression — on a shared machine the
 * walk's timing moves by more than the change costs — so this counts live
 * objects around a single walk instead. That count is deterministic, but only
 * in a fresh, small-heap process: once a process's heap is large,
 * `heapStats()` can return a stale snapshot and silently report a zero delta.
 * Hence one fixture per process, and `bun run bench` invokes it per fixture.
 *
 * Run with `bun run bench:alloc` (or `bun tests/benchmark-alloc.ts endgame.save`).
 */

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

/** Live objects after a forced GC. */
const liveObjects = (): number => {
	Bun.gc(true);
	return heapStats().objectCount;
};

// Warm both walks and drop the results, so the measured walk is the only
// thing allocating.
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
