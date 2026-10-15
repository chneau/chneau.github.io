import {
	type Bytes,
	base64Decode,
	base64Encode,
	editId,
	getAtPath,
	isJsonObject,
	type JsonValue,
	type QuickAction,
	type SaveCodec,
	type SaveEdit,
	type SavePath,
	type SummaryRow,
	yieldToBrowser,
} from "../../shared";
import { CerimalReader, CerimalWriter } from "./byte-reader";
import {
	asCerimalFile,
	isRecord,
	plainMatches,
	splitWrapper,
	toJsonValue,
	wrapperMatches,
} from "./envelope";
import { MAGIC, readDocument, writeDocument } from "./nodes";
import type { CerimalDocumentView, CerimalFile } from "./types";

export type { CerimalFile } from "./types";

const PLAYER_ROOT_TYPE = "Quantum.PlayerSerializedData";

const REALM_ROOT_TYPE = "Quantum.GameSaveData";

export const decodeSave = async (bytes: Bytes): Promise<CerimalFile> => {
	await yieldToBrowser();
	const text = new TextDecoder().decode(bytes);
	const { before, after } = splitWrapper(text);

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error(
			"This file is not a No Rest for the Wicked save: a save is a JSON document, and this one does not parse as JSON.",
		);
	}
	const root = toJsonValue(parsed);
	if (!isJsonObject(root)) {
		throw new Error(
			"This file is not a No Rest for the Wicked save: it is not a JSON object.",
		);
	}
	const payload = root.binaryInfo;
	const hasPayload = typeof payload === "string";
	const envelope = { ...root };
	if (hasPayload) delete envelope.binaryInfo;

	const documents: CerimalDocumentView[] = [];
	if (hasPayload) {
		await yieldToBrowser();
		const stream = base64Decode(payload);
		const reader = new CerimalReader(stream);
		while (reader.remaining > MAGIC.length) {
			const magic = new TextDecoder().decode(
				reader.borrow(MAGIC.length, "a document's magic"),
			);
			if (magic !== MAGIC) {
				if (documents.length === 0) {
					throw new Error(
						"This save's payload is not a CERIMAL document, so it is not a No Rest for the Wicked save.",
					);
				}
				break;
			}
			const document = readDocument(reader, stream);
			documents.push({
				rootType: document.rootType,
				version: document.header.version,
				compression: document.header.compression,
				schema: base64Encode(document.schemaBytes),
				registered: document.registered,
				dimensions: document.dimensions,
				data: document.data,
			});
			await yieldToBrowser();
		}
	}

	return {
		$cerimal: {
			envelope,
			wrapperBefore: before,
			wrapperAfter: after,
			documents,
		},
	};
};

export const encodeSave = async (value: JsonValue): Promise<Bytes> => {
	const file = asCerimalFile(value);
	const { envelope, wrapperBefore, wrapperAfter, documents } = file.$cerimal;
	await yieldToBrowser();

	if (wrapperAfter === "") {
		return new TextEncoder().encode(
			plainMatches(wrapperBefore, envelope)
				? wrapperBefore
				: JSON.stringify(envelope),
		);
	}

	const stream = new CerimalWriter(1 << 16);
	for (const document of documents) {
		writeDocument(stream, document);
	}
	const payload = base64Encode(stream.finish());
	const text = wrapperMatches(wrapperBefore, wrapperAfter, envelope)
		? `${wrapperBefore}${payload}${wrapperAfter}`
		: JSON.stringify({ ...envelope, binaryInfo: payload });
	return new TextEncoder().encode(text);
};

const fileOf = (value: JsonValue): CerimalFile | null => {
	try {
		return asCerimalFile(value);
	} catch {
		return null;
	}
};

const playerDataPath = (file: CerimalFile): SavePath | null => {
	const index = file.$cerimal.documents.findIndex(
		(document) => document.rootType === PLAYER_ROOT_TYPE,
	);
	return index < 0 ? null : ["$cerimal", "documents", index, "data"];
};

const grouped = (value: number): string => {
	const digits = Math.abs(Math.trunc(value)).toString();
	const whole = value < 0 ? `-${digits}` : digits;
	return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

const asHours = (seconds: number): string => `${(seconds / 3600).toFixed(1)} h`;

const summarise = (value: JsonValue): readonly SummaryRow[] => {
	const file = fileOf(value);
	if (!file) return [];
	const { envelope, documents } = file.$cerimal;
	const rows: SummaryRow[] = [];
	const text = (field: string): string | null => {
		const found = envelope[field];
		return typeof found === "string" && found.length > 0 ? found : null;
	};
	const number = (field: string): number | null => {
		const found = envelope[field];
		return typeof found === "number" ? found : null;
	};
	const name = text("name");
	if (name) rows.push({ label: "Save", value: name });
	const id = text("id");
	if (id) rows.push({ label: "Save id", value: id });
	const revision = number("revision");
	if (revision !== null) {
		rows.push({ label: "Revision", value: grouped(revision) });
	}
	const updated = text("updatedAt");
	if (updated) rows.push({ label: "Last saved", value: updated });
	const info = envelope.info;
	if (isRecord(info) && typeof info.Playtime === "number") {
		rows.push({ label: "Playtime", value: asHours(info.Playtime) });
	}

	const player = documents.findIndex(
		(document) => document.rootType === PLAYER_ROOT_TYPE,
	);
	if (player >= 0) {
		const data = documents[player]?.data;
		if (isRecord(data)) {
			const level = data.Level;
			if (typeof level === "number") {
				rows.push({ label: "Level", value: grouped(level), emphasis: true });
			}
			const gold = data.Gold;
			if (typeof gold === "number") {
				rows.push({ label: "Gold", value: grouped(gold), emphasis: true });
			}
			const embers = data.CrucibleCurrency;
			if (typeof embers === "number") {
				rows.push({ label: "Fallen Embers", value: grouped(embers) });
			}
			const attributes = attributeValues(data);
			if (attributes.length > 0) {
				rows.push({
					label: "Attributes",
					value: attributes
						.map(([name, value]) => `${name} ${value}`)
						.join(", "),
				});
			}
			if (typeof data.IsHardcore === "boolean") {
				rows.push({
					label: "Mode",
					value: data.IsHardcore ? "Hardcore" : "Softcore",
				});
			}
			const played = data.TimePlayed;
			if (typeof played === "number") {
				rows.push({ label: "In-game time", value: asHours(played) });
			}
		}
	} else if (
		documents.some((document) => document.rootType === REALM_ROOT_TYPE)
	) {
		rows.push({ label: "Contents", value: "Realm and world state" });
	}

	if (documents.length > 0) {
		const versions = documents
			.map((document) => `v${document.version}`)
			.join(", ");
		rows.push({ label: "CERIMAL", value: `version ${versions}` });
		const shared = documents.reduce(
			(total, document) => total + document.registered.length,
			0,
		);
		if (shared > 0) {
			rows.push({
				label: "Shared values",
				value: `${grouped(shared)} written once, referred to afterwards`,
			});
		}
	}
	return rows;
};

const attributeValues = (data: {
	readonly [key: string]: JsonValue;
}): readonly (readonly [string, number])[] => {
	const attributes = data.Attributes;
	if (!isRecord(attributes)) return [];
	const pairs: (readonly [string, number])[] = [];
	for (const entries of Object.values(attributes)) {
		if (!Array.isArray(entries)) continue;
		for (const entry of entries) {
			if (!isJsonObject(entry)) continue;
			if (
				typeof entry.key === "string" &&
				typeof entry.value === "number" &&
				(entry.key === "Health" || entry.key === "Stamina")
			) {
				pairs.push([entry.key, entry.value]);
			}
		}
	}
	return pairs;
};

const attributePaths = (data: {
	readonly [key: string]: JsonValue;
}): readonly SavePath[] => {
	const attributes = data.Attributes;
	if (!isRecord(attributes)) return [];
	const paths: SavePath[] = [];
	for (const [key, entries] of Object.entries(attributes)) {
		if (!Array.isArray(entries)) continue;
		for (const [index, entry] of entries.entries()) {
			if (!isJsonObject(entry)) continue;
			if (
				typeof entry.key === "string" &&
				typeof entry.value === "number" &&
				(entry.key === "Health" || entry.key === "Stamina")
			) {
				paths.push(["Attributes", key, index, "value"]);
			}
		}
	}
	return paths;
};

const playerData = (
	value: JsonValue,
): {
	readonly data: { readonly [key: string]: JsonValue };
	readonly base: SavePath;
} | null => {
	const file = fileOf(value);
	if (!file) return null;
	const base = playerDataPath(file);
	if (!base) return null;
	const data = getAtPath(value, base);
	return isRecord(data) ? { data, base } : null;
};

const planOn = (
	value: JsonValue,
	field: string,
	target: (current: number) => number | null,
): readonly SaveEdit[] => {
	const player = playerData(value);
	const current = player?.data[field];
	if (!player || typeof current !== "number") return [];
	const next = target(current);
	if (next === null || next === current) return [];
	const path: SavePath = [...player.base, field];
	return [
		{
			id: editId(path, next),
			label: field,
			path,
			before: current,
			after: next,
		},
	];
};

const RICH_GOLD = 9_999_999;
const EMBER_TOP_UP = 10_000;
const TOUGH_ATTRIBUTE = 30;

const ACTIONS: readonly QuickAction[] = [
	{
		id: "fill-purse",
		label: "Fill the purse",
		description: `Sets Gold to ${grouped(RICH_GOLD)}.`,
		plan: (value) => planOn(value, "Gold", () => RICH_GOLD),
	},
	{
		id: "fallen-embers",
		label: `Add ${grouped(EMBER_TOP_UP)} Fallen Embers`,
		description: `Adds ${grouped(EMBER_TOP_UP)} to CrucibleCurrency.`,
		plan: (value) =>
			planOn(value, "CrucibleCurrency", (current) => current + EMBER_TOP_UP),
	},
	{
		id: "top-up-vitality",
		label: "Top up health and stamina",
		description: `Raises Health and Stamina to ${TOUGH_ATTRIBUTE}.`,
		plan: (value) => {
			const player = playerData(value);
			if (!player) return [];
			const edits: SaveEdit[] = [];
			for (const step of attributePaths(player.data)) {
				const before = getAtPath(player.data, step);
				if (typeof before !== "number" || before >= TOUGH_ATTRIBUTE) continue;
				const path: SavePath = [...player.base, ...step];
				const attribute = getAtPath(player.data, [...step.slice(0, -2), "key"]);
				edits.push({
					id: editId(path, TOUGH_ATTRIBUTE),
					label: typeof attribute === "string" ? attribute : "attribute",
					path,
					before,
					after: TOUGH_ATTRIBUTE,
				});
			}
			return edits;
		},
	},
	{
		id: "leave-hardcore",
		label: "Leave hardcore mode",
		description: "Clears IsHardcore, so death no longer costs the character.",
		plan: (value) => planOn(value, "IsHardcore", () => 0),
	},
];

export const noRestForTheWicked: SaveCodec = {
	game: "No Rest for the Wicked",
	formatLabel: "CERIMAL, xxHash64-checked",
	extensions: ["dat"],
	defaultPath:
		"%LOCALAPPDATA%\\..\\..\\AppData\\LocalLow\\Moon Studios\\NoRestForTheWicked\\DataStore\\",
	notes: [
		{
			title: "A save is a JSON envelope around a binary graph",
			body: "A .dat file is an ordinary JSON document: an id, a name, a revision, a playtime, and a field called binaryInfo whose value is a base64 CERIMAL stream. Open one in a text editor and the first two thirds of it are readable; the rest is Moon Studios' own format, and it is the rest that holds the character. The account and settings saves have no binaryInfo at all — they are plain JSON, and this editor reads them as such.",
		},
		{
			title: "The binary describes its own types",
			body: "CERIMAL opens with the word CERIMAL, a version, the size of a type schema, the size of a payload, and a checksum. The schema then lists every type the payload uses: a GUID, a version, a base type, a list of fields, and the names of any enums. That is why a save can be read without the game — the file says what every byte means — and it is why this editor carries the schema forward untouched, because a JSON document has no way to express a type graph.",
		},
		{
			title: "Nothing is encrypted",
			body: "There is no key, no key derivation and no obfuscation anywhere in the format. What protects a save is a 64-bit xxHash64 of the schema and the payload together, and this editor checks it before reading a single field, so a damaged or edited file is refused rather than half-parsed. A rebuild recomputes it, which is why an untouched save comes back byte for byte identical.",
		},
		{
			title: "The same value is written once, and referred to after",
			body: "Most of a realm save is repetition: one item definition, one NPC, one trigger volume, appearing in every container that holds one. CERIMAL writes each of them once and then stores a small reference to it, which is why a 1.7 MB save is a graph rather than a tree — the biggest one here refers back to a value it already wrote 16 371 times. The editor keeps that sharing when it rebuilds. What it will not do is write a type the save does not declare or a field the schema does not have: every quick change below is a real field the game's own saves contain — Gold, CrucibleCurrency, the Health and Stamina entries of the Attributes dictionary, IsHardcore — and each is checked against the loaded save before it is offered, so a button with nothing to do is shown greyed out rather than silently doing nothing.",
		},
	],
	decode: decodeSave,
	encode: encodeSave,
	summarise,
	actions: ACTIONS,
};
