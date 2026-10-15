import { readClan } from "./companion-reader";
import { type DecodedSave, decodeSave } from "./container";
import { companionCatalogTable } from "./data";
import { defined } from "./defined";
import { insertRecordFields, stringFieldBytes } from "./record-field-insert";
import { commitSave } from "./transaction";

const companionNameLimit = 32;

export type CompanionNameRow = {
	mercenaryNo: number;
	characterKey: number;
	displayName: string;
	customName: string | null;
	species: string;
	category: string;
};

export type CompanionNameDescription = {
	rows: CompanionNameRow[];
	nameLimit: number;
	error: string | null;
};

const decodeName = (value: unknown): string | null => {
	if (
		value &&
		typeof value === "object" &&
		"data" in value &&
		(value as { data: unknown }).data instanceof Uint8Array
	) {
		const text = new TextDecoder("utf-8", { fatal: false }).decode(
			(value as { data: Uint8Array }).data,
		);
		return text.length > 0 ? text : null;
	}
	return null;
};

const numberValue = (value: unknown): number => {
	return typeof value === "number" ? value : 0;
};

export const describeCompanionNames = async (
	save: DecodedSave,
): Promise<CompanionNameDescription> => {
	const catalog = await companionCatalogTable();
	try {
		const clan = readClan(save.rawPayload);
		const rows = clan.records.map((record) => {
			const characterKey = numberValue(record.values._characterKey);
			const species = catalog.entries[String(characterKey)]?.name ?? null;
			const customName = decodeName(record.values._mercenaryName);
			return {
				mercenaryNo: numberValue(record.values._mercenaryNo),
				characterKey,
				displayName: customName ?? species ?? `Companion ${characterKey}`,
				customName,
				species: species ?? `Companion ${characterKey}`,
				category: catalog.entries[String(characterKey)]?.category ?? "Unknown",
			};
		});
		if (new Set(rows.map((row) => row.mercenaryNo)).size !== rows.length) {
			throw new Error("Two roster entries share a mercenary number");
		}
		return { rows, nameLimit: companionNameLimit, error: null };
	} catch (error) {
		return {
			rows: [],
			nameLimit: companionNameLimit,
			error: `Renaming is unavailable for this save: ${
				error instanceof Error ? error.message : String(error)
			}`,
		};
	}
};

export type CompanionRenameEdit = {
	type: "renameCompanion";
	mercenaryNo: number;
	characterKey: number;
	name: string;
	label: string;
};

const rosterSignature = (raw: Uint8Array): string => {
	const clan = readClan(raw);
	return JSON.stringify(
		clan.records.map((record) => [
			numberValue(record.values._mercenaryNo),
			numberValue(record.values._characterKey),
			decodeName(record.values._mercenaryName),
		]),
	);
};

export const nameRejection = (value: string): string | null => {
	const name = value.trim();
	if (name.length === 0) {
		return "A companion name cannot be empty";
	}
	for (const character of name) {
		const code = character.codePointAt(0) ?? 0;
		if (code < 0x20 || code === 0x7f) {
			return "A companion name cannot contain control characters";
		}
	}
	const encoded = new TextEncoder().encode(name);
	if (encoded.length > companionNameLimit) {
		return `A companion name can be at most ${companionNameLimit} bytes, and this one is ${encoded.length}`;
	}
	return null;
};

const checkedName = (value: string): string => {
	const reason = nameRejection(value);
	if (reason) throw new Error(reason);
	return value.trim();
};

const findRecord = (
	raw: Uint8Array,
	edit: CompanionRenameEdit,
): { start: number } => {
	const clan = readClan(raw);
	const matches = clan.records.filter(
		(record) =>
			numberValue(record.values._mercenaryNo) === edit.mercenaryNo &&
			numberValue(record.values._characterKey) === edit.characterKey,
	);
	if (matches.length !== 1) {
		throw new Error(
			`This save has no roster entry ${edit.mercenaryNo} (character ${edit.characterKey})`,
		);
	}
	return defined(matches[0], "roster entry");
};

export const applyCompanionRename = async (
	sourceBytes: Uint8Array,
	edit: CompanionRenameEdit,
): Promise<[Uint8Array, Record<string, unknown>]> => {
	const name = checkedName(edit.name);
	const decoded = await decodeSave(sourceBytes);
	const raw = decoded.rawPayload;
	const record = findRecord(raw, edit);
	const before = rosterSignature(raw);

	const inserted = insertRecordFields(raw, {
		rootType: "MercenaryClanSaveData",
		listField: "_mercenaryDataList",
		fields: [
			{
				recordStart: record.start,
				fieldName: "_mercenaryName",
				bytes: stringFieldBytes(name),
				replace: true,
			},
		],
	});

	const { bytes, reopenedPayload, verification } = await commitSave(
		{ original: raw, header: decoded.header },
		"Companion rename",
		inserted.payload,
	);

	const renamed = findRecord(reopenedPayload, edit);
	const clan = readClan(reopenedPayload);
	const entry = defined(
		clan.records.find((candidate) => candidate.start === renamed.start),
		"renamed roster entry",
	);
	if (decodeName(entry.values._mercenaryName) !== name) {
		throw new Error("Edited output did not reparse with the requested name");
	}

	const after = rosterSignature(reopenedPayload);
	const untouched = (signature: string): string => {
		const parsed = JSON.parse(signature) as Array<
			[number, number, string | null]
		>;
		return JSON.stringify(parsed.filter((row) => row[0] !== edit.mercenaryNo));
	};
	if (untouched(before) !== untouched(after)) {
		throw new Error("Another roster entry changed during the rename");
	}

	return [
		bytes,
		{
			edit: "companion_rename",
			mercenary_no: edit.mercenaryNo,
			character_key: edit.characterKey,
			name,
			field_created: inserted.fieldsCreated > 0,
			bytes_added: inserted.bytesAdded,
			...verification,
			roster_reparsed: true,
		},
	];
};
