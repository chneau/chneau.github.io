/**
 * No Rest for the Wicked — CERIMAL.
 *
 * The game keeps each save as a JSON envelope with a base64 payload, and the
 * payload is Moon Studios' own binary serialisation. Nothing about it is
 * encrypted: there is no key, no derivation and no obfuscation, which is why
 * this file is a parser and a writer rather than a key cracker.
 *
 * ## The layout, as implemented here
 *
 * ```text
 * .dat  →  { "id", "name", "revision", "info", "binaryInfo": "<base64>", … }
 *            └── base64 → CERIMAL stream: one or more documents
 *
 * CERIMAL document
 *   "CERIMAL"                      7 bytes, ASCII
 *   version                        u8   — 2, or 3 with a compression field
 *   schemaSize                     u32
 *   contentSize                    u32
 *   compression                    u32  — version 3 only; 0 = stored, 1 = zstd
 *   checksum                       u64  — xxHash64 of the schema and content
 *   schema      schemaSize bytes   — the type graph (see below)
 *   content     contentSize bytes  — the data, as a stream of tagged nodes
 * ```
 *
 * The schema is self-describing: a header, then one definition per type — each
 * with a GUID, a local version, an optional base type and a list of members —
 * then the type *names* as a block of 7-bit-length-prefixed UTF-8, then the
 * root type. Reading a save therefore never needs the game: the file says what
 * every byte means. The cost of that design lands on the writer, because a JSON
 * document has nowhere to put a type graph (see `CerimalFile`).
 *
 * The content section is a graph, not a tree. Every value that is not a fixed
 * width primitive is introduced by a 7-bit tag, and that tag carries three
 * things at once: whether the node is null, whether it is a *back-reference* to
 * an earlier value already written, and — for strings and arrays — the length
 * or the first dimension. A document describing a whole realm leans on this
 * hard: 16 371 of the nodes in one real save are back-references, because the
 * same item definition appears in every container that holds one.
 *
 * ## Why the document carries the schema
 *
 * `decode` has to produce JSON and `encode` has to produce the exact bytes
 * back. The data can be carried in JSON. The *types* cannot: GUIDs, member
 * kinds, local versions and enum names have no JSON spelling, and inferring
 * them from the data would mean guessing. So the schema section is carried
 * verbatim as base64 beside the decoded data and re-parsed on the way out. The
 * same argument covers the one decision a value cannot express — which nodes
 * are registered into the back-reference table — which is carried as a list of
 * paths. A *reference* to a registered value needs no record of its own: the
 * reader hands back the very same object for a reference, so the re-encoder
 * recognises one by the same object appearing a second time.
 *
 * The header's checksum is deliberately *not* carried. The workbench proves a
 * rebuild by decoding it again and comparing the two documents field by field,
 * and the checksum of edited content is necessarily different from the one
 * that was read — carrying it would make every edit look like a failure.
 *
 * ## Byte-exactness is the contract
 *
 * Re-encoding an untouched save must reproduce it byte for byte, or the
 * round-trip proof the page shows the user is a claim rather than a check.
 * Three things make that true, and each is asserted against the real `.dat`
 * files in `tests/format.test.ts`: the writer re-emits the schema from the
 * same numbers the reader took apart, the content stream is walked in the same
 * order with the same tag decisions, and the JSON envelope is re-spliced into
 * the original text rather than re-serialised — `"createdAtEpoch":1748808327.0`
 * does not survive `JSON.stringify`, and neither does the game's key order.
 *
 * ## Staying on the main thread
 *
 * A realm save is 1.7 MB of content and building the tree takes a few hundred
 * milliseconds. The engine therefore stays on the main thread and yields
 * through a `setTimeout` macrotask between phases and between documents, the
 * same trade the Crimson Desert editor recorded in ADR-0001 and ADR-0003: a
 * worker would mean structured-cloning the tree across a boundary, which costs
 * more than it saves and would hold a second copy of a multi-megabyte save.
 */
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

/** The root type of a character save: the one document that holds the player. */
const PLAYER_ROOT_TYPE = "Quantum.PlayerSerializedData";

/** The root type of a realm save, which holds the world rather than a player. */
const REALM_ROOT_TYPE = "Quantum.GameSaveData";

// ---------------------------------------------------------------------------
// The saved file
// ---------------------------------------------------------------------------

/** Reads a `.dat` file into the document the editor works on. */
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
			// `readDocument` leaves the cursor at the end of the document, so the
			// next `CERIMAL` magic is found by simply carrying on.
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
			// Between documents, not inside one: a realm save's single document
			// is built in one pass, and a worker is ruled out by ADR-0001.
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

/** Rebuilds a `.dat` file from the document the editor produced. */
export const encodeSave = async (value: JsonValue): Promise<Bytes> => {
	const file = asCerimalFile(value);
	const { envelope, wrapperBefore, wrapperAfter, documents } = file.$cerimal;
	await yieldToBrowser();

	// A save with no payload is a plain JSON document — an account or a settings
	// file — and the file *is* that document. It is written back as it was read
	// unless the envelope has been edited, in which case it is re-serialised.
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
	// The payload is spliced back between the two wrapper halves when the
	// envelope is untouched, so an unedited save comes back byte for byte.
	// An edited envelope cannot be spliced — its text no longer matches — so the
	// file is rebuilt from the document instead: the game's own formatting is
	// gone, but the change the user asked for is in the file, which is the trade
	// that matters.
	const text = wrapperMatches(wrapperBefore, wrapperAfter, envelope)
		? `${wrapperBefore}${payload}${wrapperAfter}`
		: JSON.stringify({ ...envelope, binaryInfo: payload });
	return new TextEncoder().encode(text);
};

// ---------------------------------------------------------------------------
// What the page shows, and what it offers
// ---------------------------------------------------------------------------

/** The document behind a value, or `null` when it is not one of ours. */
const fileOf = (value: JsonValue): CerimalFile | null => {
	// `summarise` and the quick actions are handed whatever is in the editor,
	// which is a document this codec decoded but the user may since have
	// edited, so both go through the same field-by-field check `encode` does
	// rather than trusting the shape. A value that no longer holds together
	// yields no summary and no actions, which is the honest answer — not a
	// crash on the way to the download button, and not a summary built out of
	// guesses.
	try {
		return asCerimalFile(value);
	} catch {
		return null;
	}
};

/** Where the player document's data sits, or `null` when the save holds none. */
const playerDataPath = (file: CerimalFile): SavePath | null => {
	const index = file.$cerimal.documents.findIndex(
		(document) => document.rootType === PLAYER_ROOT_TYPE,
	);
	return index < 0 ? null : ["$cerimal", "documents", index, "data"];
};

/** Thousands separators, without depending on the reader's locale settings. */
const grouped = (value: number): string => {
	const digits = Math.abs(Math.trunc(value)).toString();
	const whole = value < 0 ? `-${digits}` : digits;
	return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

/** `137875.9` seconds as `38.3 h`, which is how a player reads a playtime. */
const asHours = (seconds: number): string => `${(seconds / 3600).toFixed(1)} h`;

/**
 * The facts about a loaded save.
 *
 * Every one of these is read out of the file by the name the game gave it, and
 * each row that cannot be filled is left out rather than guessed: a realm save
 * has no level, and saying "0" for one would be a lie the summary could not
 * explain. The character figures come from `Quantum.PlayerSerializedData`, whose
 * field names — `Gold`, `CrucibleCurrency`, `Attributes`, `IsHardcore`,
 * `TimePlayed` — are the game's own.
 */
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
	// `info.Playtime` is the account-level total; a character save carries it.
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

/**
 * The attribute dictionary as name and value pairs.
 *
 * `Attributes` holds a dictionary, and a dictionary is stored in the decoded
 * document under the *position* it was declared at (`$dict0`, `$dict1`, …)
 * rather than a name — the schema gives a list or a dictionary no name of its
 * own. So the entries are found by what is in them: the keys `Health` and
 * `Stamina` are the game's, not ours, and they are what identifies the
 * dictionary in a save that may hold several.
 */
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

/** The paths of the attribute values, found the same way `summarise` finds them. */
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

/**
 * The player's own data, and where it sits.
 *
 * Both together because every quick action needs them: the value to change and
 * the path to change it at, which is the document path up to the data plus the
 * field. Returning the pair is what keeps the four actions below from each
 * rebuilding the same prefix.
 */
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

/**
 * One edit, or none of them.
 *
 * A cheat that has nothing to do returns `[]`, which is how a quick action
 * greys itself out: the button is driven by the length of what `plan` returns,
 * so an action that would rewrite a value the save already holds is one the
 * user cannot click — and one that cannot be expressed is one the editor does
 * not pretend to have.
 */
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
		// Hand-built rather than routed through `planOn`, because an attribute
		// lives inside the dictionary rather than beside it.
		plan: (value) => {
			const player = playerData(value);
			if (!player) return [];
			const edits: SaveEdit[] = [];
			for (const step of attributePaths(player.data)) {
				const before = getAtPath(player.data, step);
				if (typeof before !== "number" || before >= TOUGH_ATTRIBUTE) continue;
				const path: SavePath = [...player.base, ...step];
				// The label names the attribute rather than the dictionary it
				// sits in, because "Health 14" is what a player recognises and
				// "$dict0" is what the schema calls it.
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

/**
 * The editor's contract with the workbench.
 *
 * `decode` and `encode` are the two functions above, unchanged: the round trip
 * they make is the whole point of the tool, and the tests hold it to the byte
 * on eleven real saves. Everything else here is what the page shows.
 */
export const noRestForTheWicked: SaveCodec = {
	id: "no-rest-for-the-wicked-save-editor",
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
