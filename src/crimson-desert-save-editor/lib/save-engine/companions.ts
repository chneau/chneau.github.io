/**
 * TypeScript port of `public/python/editor/browser_companions.py`.
 */

import {
	bytesEqual,
	concatBytes,
	indexOfBytes,
	packU64,
	writeI64,
	writeU16,
	writeU32,
} from "./bytes";
import {
	type ClanLayout,
	normalizeCompanionBytes,
	normalizedCompanionRecord,
	readClan,
	recordLocators,
} from "./companion-reader";
import { type DecodedSave, decodeSave } from "./container";
import {
	type CompanionCatalogFile,
	type CompanionTemplate,
	type CompanionTemplatesFile,
	companionCatalogTable,
	companionTemplatesTable,
} from "./data";
import { defined } from "./defined";
import { describeError } from "./errors";
import { readInventory } from "./inventory-reader";
import {
	normalizedBlock,
	preservedRoot,
	relocatedRoot,
	shiftExistingBlockPointers,
	typeSignatureArray,
	writeListCount,
} from "./parc";
import { parseParcBlob, serializeParc } from "./parc-serializer";
import { commitSave, sha256Hex } from "./transaction";

const ROBO_KEY = 1000006;
const MAX_ROBO_WORKERS = 500;
const EXCLUDED = new Set([1000799, 1001467, 1000532]);

let catalogPromise: Promise<CompanionCatalogFile> | undefined;
let templatesPromise: Promise<CompanionTemplatesFile> | undefined;

const companionCatalog = (): Promise<CompanionCatalogFile> => {
	catalogPromise ??= companionCatalogTable();
	return catalogPromise;
};

const companionTemplates = (): Promise<CompanionTemplatesFile> => {
	templatesPromise ??= companionTemplatesTable();
	return templatesPromise;
};

const addable = (
	key: number,
	catalog: CompanionCatalogFile,
	templates: CompanionTemplatesFile,
): boolean => {
	const entry = catalog.entries[String(key)];
	return (
		!EXCLUDED.has(key) && Boolean(entry?.addable) && String(key) in templates
	);
};

const compatible = (clan: ClanLayout, template: CompanionTemplate): boolean => {
	const kinds = new Map(clan.parc.types.map((type) => [type.name, type]));
	return template.locators.every((loc) => {
		const kind = kinds.get(loc.type);
		return (
			Boolean(kind) &&
			JSON.stringify(
				typeSignatureArray(defined(kind, "companion locator type")),
			) === JSON.stringify(loc.schema)
		);
	});
};

const whole = (value: unknown, label: string): number => {
	if (!Number.isInteger(value) || (value as number) < 1) {
		throw new Error(`${label} must be a positive whole number.`);
	}
	return value as number;
};

const categoryOf = (
	key: number,
	catalog: CompanionCatalogFile,
): string | undefined => {
	return catalog.entries[String(key)]?.category;
};

const ownershipGroup = (key: number, catalog: CompanionCatalogFile): string => {
	return catalog.entries[String(key)]?.ownershipGroup ?? `character:${key}`;
};

type CompanionRosterEntry = {
	characterKey: number;
	id: string;
	name: string;
	species: string;
	category: string;
	selected: boolean;
	assigned: boolean;
	robot: boolean;
};

export type CompanionDescription = {
	records: CompanionRosterEntry[];
	roboWorkers: number;
	maxRoboWorkers: number;
	remainingWorkers: number;
	availableKeys: number[];
	workersSupported: boolean;
	error: string | null;
};

const fieldNameData = (value: unknown): string => {
	if (
		value &&
		typeof value === "object" &&
		"data" in value &&
		(value as { data: unknown }).data instanceof Uint8Array
	) {
		return new TextDecoder("utf-8", { fatal: false }).decode(
			(value as { data: Uint8Array }).data,
		);
	}
	return "";
};

export const describeCompanions = async (
	save: DecodedSave,
): Promise<CompanionDescription> => {
	const [catalog, templates] = await Promise.all([
		companionCatalog(),
		companionTemplates(),
	]);
	try {
		const clan = readClan(save.rawPayload);
		const rows: CompanionRosterEntry[] = [];
		for (const record of clan.records) {
			const key = record.values._characterKey as number;
			const definition = catalog.entries[String(key)];
			if (!definition) continue;
			const custom = record.values._mercenaryName;
			const name = fieldNameData(custom);
			rows.push({
				characterKey: key,
				id: String(record.values._mercenaryNo),
				name: name || definition.name,
				species: definition.name,
				category: definition.category,
				selected: Boolean(record.values._isMainMercenary),
				assigned: Boolean(record.values._workPlaceFactionNodeKey),
				robot: key === ROBO_KEY,
			});
		}
		const robots = clan.records.filter(
			(record) => record.values._characterKey === ROBO_KEY,
		).length;
		const available = Object.keys(templates)
			.map((key) => Number(key))
			.filter(
				(key) =>
					addable(key, catalog, templates) &&
					compatible(
						clan,
						defined(templates[String(key)], "companion template").idle,
					),
			);
		return {
			records: rows,
			roboWorkers: robots,
			maxRoboWorkers: MAX_ROBO_WORKERS,
			remainingWorkers: Math.max(0, MAX_ROBO_WORKERS - robots),
			availableKeys: available,
			workersSupported: robots > 0,
			error: null,
		};
	} catch (error) {
		return {
			records: [],
			roboWorkers: 0,
			maxRoboWorkers: MAX_ROBO_WORKERS,
			remainingWorkers: 0,
			availableKeys: [],
			workersSupported: false,
			error: `Companion additions are unavailable for this save format: ${describeError(
				error,
			)}`,
		};
	}
};

type CompanionOperation = {
	type: string;
	quantity?: number;
	characterKey?: number;
};

const base64ToBytes = (value: string): Uint8Array => {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index++) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
};

export const applyCompanionAdditions = async (
	source: Uint8Array,
	operations: CompanionOperation[],
): Promise<[Uint8Array, Record<string, unknown>]> => {
	if (!Array.isArray(operations) || operations.length === 0) {
		throw new Error("No companion additions requested.");
	}
	const [catalog, templates] = await Promise.all([
		companionCatalog(),
		companionTemplates(),
	]);
	const decoded = await decodeSave(source);
	const raw = decoded.rawPayload;
	const before = readClan(raw);
	const owned = new Set(
		before.records.map((record) => record.values._characterKey as number),
	);
	const ownedGroups = new Set(
		[...owned].map((key) => ownershipGroup(key, catalog)),
	);
	const robots = before.records.filter(
		(record) => record.values._characterKey === ROBO_KEY,
	).length;

	const chosen: number[] = [];
	let workerCount = 0;
	const newKeys = new Set<number>();
	for (const op of operations) {
		if (!op || typeof op !== "object") {
			throw new Error("Invalid companion addition.");
		}
		if (op.type === "addRoboWorkers") {
			workerCount += whole(op.quantity, "Worker quantity");
			if (robots === 0) {
				throw new Error(
					"Worker additions currently require a save with existing robo workers and camp access.",
				);
			}
			if (robots + workerCount > MAX_ROBO_WORKERS) {
				throw new Error(
					`Robo workers are capped at 500 total. You can add at most ${Math.max(
						0,
						500 - robots,
					)} to this save.`,
				);
			}
			for (let index = 0; index < (op.quantity as number); index++) {
				chosen.push(ROBO_KEY);
			}
		} else if (op.type === "addCompanion") {
			const key = whole(op.characterKey, "Companion");
			if (!addable(key, catalog, templates) || key === ROBO_KEY) {
				throw new Error("This companion is not available for addition.");
			}
			const group = ownershipGroup(key, catalog);
			if (
				ownedGroups.has(group) ||
				[...newKeys].some(
					(candidate) => ownershipGroup(candidate, catalog) === group,
				)
			) {
				throw new Error(
					"This companion or a variant sharing its ownership slot is already owned or queued.",
				);
			}
			newKeys.add(key);
			chosen.push(key);
		} else {
			throw new Error("Unsupported companion edit.");
		}
	}

	const selectedGroups = new Set(
		before.records
			.filter(
				(record) =>
					record.values._isMainMercenary &&
					record.values._ownedCharacterKey === 1,
			)
			.map((record) =>
				categoryOf(record.values._characterKey as number, catalog),
			)
			.filter((value): value is string => value !== undefined),
	);
	const used = [
		...before.records.map((record) => Number(record.values._mercenaryNo)),
		...readInventory(raw).map((record) => record.itemNo),
	];
	let number = Math.max(0, ...used) + 1;
	const allocate = (): number => {
		while (indexOfBytes(raw, packU64(number)) >= 0) {
			number += 1;
		}
		const value = number;
		number += 1;
		return value;
	};

	const clones: Uint8Array[] = [];
	const expectedRows: Array<[number, Uint8Array, number, number, boolean]> = [];
	const ids: number[] = [];
	let position = before.listEnd;
	for (const key of chosen) {
		const category = categoryOf(key, catalog);
		const selected = category !== "camp" && !selectedGroups.has(category ?? "");
		const entry = defined(templates[String(key)], "companion template");
		const template = defined(
			selected ? entry.selected : entry.idle,
			`the ${selected ? "selected" : "idle"} companion template`,
		);
		if (!compatible(before, template)) {
			throw new Error(
				"This save uses an unsupported companion format. Save once in the current game version and reopen it.",
			);
		}
		const clone = base64ToBytes(template.record);
		if ((await sha256Hex(clone)) !== template.sha256) {
			throw new Error("Companion template failed validation.");
		}
		const localIds: number[] = [];
		for (const identity of template.identities) {
			const value = allocate();
			writeI64(clone, identity.offset, BigInt(value));
			localIds.push(value);
		}
		for (const loc of template.locators) {
			const kind = before.parc.types.find((type) => type.name === loc.type);
			if (!kind) throw new Error("Companion template locator type is missing.");
			writeU16(clone, loc.typeOffset, kind.index);
			writeU32(clone, loc.pointerOffset, position + loc.pointerOffset + 4);
		}
		expectedRows.push([
			position,
			clone,
			key,
			defined(localIds[0], "companion identity"),
			selected,
		]);
		ids.push(...localIds);
		clones.push(clone);
		position += clone.length;
		if (selected) selectedGroups.add(category ?? "");
	}

	const joined = concatBytes(...clones);
	const original =
		before.parc.blockRaw.get(before.entry.index) ?? new Uint8Array();
	const relative = before.listEnd - before.entry.dataOffset;
	const block = concatBytes(
		original.slice(0, relative),
		joined,
		original.slice(relative),
	);
	shiftExistingBlockPointers(
		original,
		block,
		before.entry.dataOffset,
		before.listEnd,
		joined.length,
	);
	writeListCount(
		block,
		before.entry.dataOffset,
		before.listStart,
		before.records.length + chosen.length,
	);
	before.parc.modifiedBlocks.set(before.entry.index, block);

	const edited = serializeParc(before.parc);
	const layout = parseParcBlob(edited);
	for (let index = 0; index < before.parc.tocEntries.length; index++) {
		const oldEntry = defined(before.parc.tocEntries[index], "old TOC entry");
		const newEntry = defined(layout.tocEntries[index], "new TOC entry");
		if (oldEntry.index !== before.entry.index) {
			edited.set(
				relocatedRoot(before.parc, oldEntry, newEntry),
				newEntry.dataOffset,
			);
		}
	}
	const after = readClan(edited);
	if (after.records.length !== before.records.length + chosen.length) {
		throw new Error("Companion count changed unexpectedly.");
	}
	for (let index = 0; index < before.records.length; index++) {
		const oldRecord = defined(
			before.records[index],
			"existing companion record",
		);
		const newRecord = defined(
			after.records[index],
			"reparsed companion record",
		);
		if (
			!bytesEqual(
				normalizedCompanionRecord(raw, oldRecord),
				normalizedCompanionRecord(edited, newRecord),
			)
		) {
			throw new Error("An existing companion changed unexpectedly.");
		}
	}
	for (let index = 0; index < expectedRows.length; index++) {
		const record = defined(
			after.records[before.records.length + index],
			"added companion record",
		);
		const [position, blob, key, identity, selected] = defined(
			expectedRows[index],
			"expected companion row",
		);
		// The clone is validated as if it sat at the position it was written to,
		// matching how the parsed record's inline self-pointers are normalized.
		if (
			!bytesEqual(
				normalizedCompanionRecord(edited, record),
				normalizeCompanionBytes(blob, position),
			)
		) {
			throw new Error("New companion data failed validation.");
		}
		if (
			record.values._characterKey !== key ||
			record.values._mercenaryNo !== identity ||
			Boolean(record.values._isMainMercenary) !== selected
		) {
			throw new Error("New companion identity or selection failed validation.");
		}
		if (
			categoryOf(key, catalog) === "pets" &&
			recordLocators(edited, record, after.parc).some((loc) =>
				["ItemSaveData", "ItemSocketSaveData"].includes(loc.type.name),
			)
		) {
			throw new Error("New pets must be unequipped.");
		}
	}
	if (new Set(ids).size !== ids.length) {
		throw new Error("New companion identity collision.");
	}
	if (
		!bytesEqual(before.parc.schemaBytes, after.parc.schemaBytes) ||
		before.parc.tocEntries.length !== after.parc.tocEntries.length
	) {
		throw new Error("Schema or root count changed.");
	}
	for (let index = 0; index < before.parc.tocEntries.length; index++) {
		const oldEntry = defined(before.parc.tocEntries[index], "old TOC entry");
		const newEntry = defined(after.parc.tocEntries[index], "new TOC entry");
		if (oldEntry.classIndex !== newEntry.classIndex) {
			throw new Error("Root order changed.");
		}
		if (
			oldEntry.index !== before.entry.index &&
			!preservedRoot(before.parc, oldEntry, after.parc, newEntry)
		) {
			throw new Error(
				`Unrelated save data changed: ${
					before.parc.typeByIndex.get(oldEntry.classIndex)?.name
				} (${oldEntry.index}).`,
			);
		}
	}

	before.parc.blockRaw.set(before.entry.index, block);
	before.entry.dataSize = block.length;
	if (
		!bytesEqual(
			normalizedBlock(before.parc, before.entry),
			normalizedBlock(after.parc, after.entry),
		)
	) {
		throw new Error("Unexpected companion collection change.");
	}

	const { bytes: output, verification } = await commitSave(
		{ original: decoded.rawPayload, header: decoded.header },
		"Edited save",
		edited,
	);
	return [
		output,
		{
			addedCompanions: chosen.length,
			addedRoboWorkers: workerCount,
			roboWorkersAfter: robots + workerCount,
			preservedExistingCompanions: before.records.length,
			preservedOtherRoots: after.parc.tocEntries.length - 1,
			outputSha256: verification.output_sha256,
		},
	];
};
