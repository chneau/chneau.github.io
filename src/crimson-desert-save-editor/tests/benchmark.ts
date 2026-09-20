/**
 * Micro-benchmarks for the save-engine hot path.
 *
 * Every fixture-based test pays the same toll: `decodeSave` (ChaCha20 +
 * HMAC + LZ4), `encodeSave` (LZ4 + ChaCha20 + HMAC), and `commitSave`'s
 * reopen proof. This script times each stage in isolation so an optimization
 * can be checked against real numbers instead of whole-suite wall time.
 *
 * Run with `bun run bench` (or `bun tests/benchmark.ts`).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describeInventory } from "../lib/save-engine/browser-equipment";
import { describeCharacters } from "../lib/save-engine/characters";
import { chacha20, lz4Compress, lz4Decompress } from "../lib/save-engine/codec";
import { describeCompanions } from "../lib/save-engine/companions";
import { decodeSave, encodeSave } from "../lib/save-engine/container";
import { readInventory } from "../lib/save-engine/inventory-reader";
import {
	readRoot,
	walkObjectList,
	walkObjectListColumns,
} from "../lib/save-engine/object-walk";
import { parseParcBlob } from "../lib/save-engine/parc-serializer";
import { describeQuests } from "../lib/save-engine/quests";

/**
 * The same key derivation `container.ts` does privately; duplicated here so
 * the bench can time ChaCha20 in isolation without widening the API.
 */
const saveKeyFor = (version: number): Uint8Array => {
	const prefixes: Record<number, string> = {
		1: "5e516762726d2f2e2340607a73725d5c40727666616c2322",
		2: "5e506561726c2d2d2341627973735f5f402121",
	};
	const prefix = prefixes[version];
	if (prefix === undefined) throw new Error(`version ${version}`);
	const fromHex = (hex: string): Uint8Array => {
		const output = new Uint8Array(hex.length / 2);
		for (let index = 0; index < output.length; index++) {
			output[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
		}
		return output;
	};
	const secret = new TextEncoder().encode("PRIVATE_HMAC_SECRET_CHECK");
	const material = new Uint8Array(prefix.length / 2 + secret.length);
	material.set(fromHex(prefix));
	material.set(secret, prefix.length / 2);
	const base = fromHex(
		"c41b8e730df259a637cc04e9b12f9668da107a853e61f9224db80ad75c13ef",
	);
	const length = Math.min(base.length, material.length);
	const key = new Uint8Array(length + 1);
	for (let index = 0; index < length; index++) {
		key[index] = (base[index] ?? 0) ^ (material[index] ?? 0);
	}
	return key;
};

const root = join(import.meta.dir, "..");
const fixture = (name: string): Uint8Array =>
	new Uint8Array(readFileSync(join(root, "saves", name)));

const time = (
	label: string,
	iterations: number,
	run: () => unknown | Promise<unknown>,
): void => {
	// One warmup pass so JIT tier-up does not skew the first measurement.
	run();
	const started = performance.now();
	for (let index = 0; index < iterations; index++) run();
	const elapsed = performance.now() - started;
	console.log(
		`${label.padEnd(46)} ${iterations}\t${(elapsed / iterations).toFixed(
			2,
		)} ms/op`,
	);
};

const timeAsync = async (
	label: string,
	iterations: number,
	run: () => Promise<unknown>,
): Promise<void> => {
	await run();
	const started = performance.now();
	for (let index = 0; index < iterations; index++) await run();
	const elapsed = performance.now() - started;
	console.log(
		`${label.padEnd(46)} ${iterations}\t${(elapsed / iterations).toFixed(
			2,
		)} ms/op`,
	);
};

const save = fixture("save.save");
const endgame = fixture("endgame.save");

for (const [name, bytes] of [
	["save.save", save],
	["endgame.save", endgame],
] as const) {
	const decoded = await decodeSave(bytes);
	const raw = decoded.rawPayload;

	console.log(
		`\n=== ${name} (${bytes.length} bytes, payload ${raw.length}) ===`,
	);
	time(`chacha20 payload (${name})`, 20, () =>
		chacha20(
			decoded.compressedPayload,
			decoded.header.nonce,
			saveKeyFor(decoded.header.version),
		),
	);
	time(`lz4Decompress (${name})`, 20, () =>
		lz4Decompress(decoded.compressedPayload, decoded.header.uncompressedSize),
	);
	time(`lz4Compress (${name})`, 5, () => lz4Compress(decoded.rawPayload));
	await timeAsync(`decodeSave (${name})`, 10, () => decodeSave(bytes));
	await timeAsync(`encodeSave (${name})`, 5, () =>
		encodeSave(decoded.rawPayload, decoded.header),
	);
	await timeAsync(`encode+reopen commit (${name})`, 5, async () => {
		const output = await encodeSave(raw, decoded.header);
		await decodeSave(output);
	});

	// Read paths: each describe* parses the payload it is handed, so this
	// section isolates its parse cost from `decodeSave` above.
	console.log(`\n=== read path: ${name} (${raw.length} bytes) ===`);
	time(`parseParcBlob (${name})`, 10, () => parseParcBlob(raw));
	time(`readInventory (${name})`, 10, () => readInventory(raw));
	await timeAsync(`describeInventory (${name})`, 5, () =>
		describeInventory(decoded),
	);
	await timeAsync(`describeCharacters (${name})`, 5, () =>
		describeCharacters(decoded),
	);
	await timeAsync(`describeCompanions (${name})`, 5, () =>
		describeCompanions(decoded),
	);
	await timeAsync(`describeQuests (${name})`, 5, () => describeQuests(decoded));

	// Quest-table breakdown: readRoot parses each list once to find its end
	// (parseObjectList); walkObjectList parses every element again for fields.
	const questRoot = readRoot(raw, "QuestSaveData");
	time(`quest readRoot (incl. list-end parse) (${name})`, 5, () =>
		readRoot(raw, "QuestSaveData"),
	);
	for (const tableField of [
		"_questStateList",
		"_missionStateList",
		"_stageStateData",
		"_questGaugeStateList",
	]) {
		const field = questRoot.fields.find(
			(candidate) => candidate.name === tableField && candidate.present,
		);
		if (!field || field.start === undefined || field.end === undefined) {
			continue;
		}
		time(`walkObjectList ${tableField} (${name})`, 5, () =>
			walkObjectList(questRoot.parser, field),
		);
		time(`walkObjectListColumns ${tableField} (${name})`, 5, () =>
			walkObjectListColumns(questRoot.parser, field),
		);
	}
}
