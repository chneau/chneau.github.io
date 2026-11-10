import {
	ByteReader,
	type Bytes,
	ByteWriter,
	fromHex,
	isJsonObject,
	type JsonValue,
	toHex,
} from "../../shared";

type BagEntry = {
	readonly id: number;
	readonly quantity: number;
	readonly lead?: number;
	readonly trail?: string;
};

type BagSection = {
	readonly format: "shared-bag";
	readonly version: number;
	readonly kind: number;
	readonly entries: readonly BagEntry[];
	readonly tail?: string;
};

type SectionRow = {
	readonly key: string;
	readonly label: string;
	readonly bytes: number;
	readonly editing: string;
};

const BAG_KEY = "ci";
export const SECTION_KEY = "__sections";
const BAG_ENTRY_BYTES = 24;
const BAG_HEADER_BYTES = 12;
const TRAIL_BYTES = 12;

const SECTION_LABELS: Readonly<Record<string, string>> = {
	l: "Story and world unlocks",
	b: "Unused bag",
	au: "Unused aura slot",
	cr: "Crafting recipe flags",
	bls: "Boss levels",
	ci: "Shared bag",
	bs: "Boss progress",
	ca: "Collectibles and waypoints",
	ce: "Item list",
	a: "Achievement progress",
};

const sectionLabel = (key: string): string =>
	SECTION_LABELS[key] ?? `Section ${key}`;

const decodeBag = (hex: string): BagSection => {
	const bytes = fromHex(hex, "shared bag");
	const reader = new ByteReader(bytes);
	if (bytes.length < BAG_HEADER_BYTES) {
		throw new Error("The shared bag section is shorter than its header.");
	}
	const version = reader.u32("bag version");
	const count = reader.u32("bag count");
	const kind = reader.u32("bag kind");
	const needed = BAG_HEADER_BYTES + count * BAG_ENTRY_BYTES;
	if (bytes.length < needed) {
		throw new Error(
			`The shared bag claims ${count} entries but only ${bytes.length} bytes are present.`,
		);
	}
	const entries: BagEntry[] = [];
	for (let id = 0; id < count; id++) {
		const lead = reader.u32(`bag entry ${id} lead`);
		const quantity = reader.f64(`bag entry ${id} quantity`);
		const trail = toHex(reader.raw(TRAIL_BYTES, `bag entry ${id} trail`));
		const canonicalTrail = "0".repeat(TRAIL_BYTES * 2);
		entries.push({
			id,
			quantity,
			...(lead === 0 ? {} : { lead }),
			...(trail === canonicalTrail ? {} : { trail }),
		});
	}
	const tail = reader.remaining > 0 ? toHex(reader.raw(reader.remaining)) : "";
	return {
		format: "shared-bag",
		version,
		kind,
		entries,
		...(tail === "" ? {} : { tail }),
	};
};

const encodeBag = (value: JsonValue): string => {
	if (!isJsonObject(value)) {
		throw new Error("The shared bag section is missing from this save.");
	}
	if (value.format !== "shared-bag") {
		throw new Error("The shared bag section has an unexpected shape.");
	}
	const version = value.version;
	const kind = value.kind;
	const entries = value.entries;
	const tail = value.tail;
	if (typeof version !== "number" || !Number.isInteger(version)) {
		throw new Error("The shared bag version is not an integer.");
	}
	if (typeof kind !== "number" || !Number.isInteger(kind)) {
		throw new Error("The shared bag kind is not an integer.");
	}
	if (!Array.isArray(entries)) {
		throw new Error("The shared bag entries are missing.");
	}
	const tailBytes =
		typeof tail === "string" ? fromHex(tail, "shared bag tail") : undefined;
	const writer = new ByteWriter(
		BAG_HEADER_BYTES +
			entries.length * BAG_ENTRY_BYTES +
			(tailBytes?.length ?? 0),
	);
	writer.u32(version);
	writer.u32(entries.length);
	writer.u32(kind);
	for (const [index, entry] of entries.entries()) {
		if (!isJsonObject(entry)) {
			throw new Error(`Shared bag entry ${index} is not an object.`);
		}
		const id = entry.id;
		const quantity = entry.quantity;
		const lead = entry.lead;
		const trail = entry.trail;
		if (id !== index) {
			throw new Error(
				`Shared bag entry ${index} carries id ${String(id)} instead of its slot.`,
			);
		}
		if (typeof quantity !== "number" || !Number.isFinite(quantity)) {
			throw new Error(`Shared bag entry ${index} is not a finite number.`);
		}
		if (
			lead !== undefined &&
			(typeof lead !== "number" || !Number.isInteger(lead))
		) {
			throw new Error(`Shared bag entry ${index} has an invalid lead field.`);
		}
		const trailBytes =
			trail === undefined
				? new Uint8Array(TRAIL_BYTES)
				: typeof trail === "string"
					? fromHex(trail, `shared bag entry ${index} trail`)
					: undefined;
		if (trailBytes === undefined) {
			throw new Error(`Shared bag entry ${index} has an invalid trail field.`);
		}
		if (trailBytes.length !== TRAIL_BYTES) {
			throw new Error(
				`Shared bag entry ${index} trail is ${trailBytes.length} bytes, expected ${TRAIL_BYTES}.`,
			);
		}
		writer.u32(typeof lead === "number" ? lead : 0);
		writer.f64(quantity);
		writer.raw(trailBytes);
	}
	if (tailBytes !== undefined) writer.raw(tailBytes);
	return toHex(writer.finish()).toUpperCase();
};

const isHex = (value: string): boolean =>
	value.length % 2 === 0 && /^[0-9A-Fa-f]*$/.test(value);

const sectionRows = (doc: Readonly<Record<string, JsonValue>>): SectionRow[] =>
	Object.entries(doc)
		.filter(([key]) => key !== SECTION_KEY)
		.map(([key, value]) => {
			const bag = isJsonObject(value) && value.format === "shared-bag";
			const bytes =
				typeof value === "string" && isHex(value)
					? value.length / 2
					: bag
						? BAG_HEADER_BYTES +
							(Array.isArray(value.entries) ? value.entries.length : 0) *
								BAG_ENTRY_BYTES
						: 0;
			return {
				key,
				label: sectionLabel(key),
				bytes,
				editing: key === BAG_KEY ? "Counts" : "Preserved",
			};
		});

export const decodeGlobalSave = (text: string): JsonValue => {
	const parsed: unknown = JSON.parse(text);
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error(
			"This file is not a Chronicon save: its JSON is not an object.",
		);
	}
	const fields = Object.entries(parsed);
	const output: Record<string, JsonValue> = {};
	for (const [key, value] of fields) {
		if (key === BAG_KEY) {
			if (typeof value !== "string" || !isHex(value)) {
				throw new Error("The shared bag section is not a hex payload.");
			}
			output[key] = decodeBag(value);
		} else if (typeof value === "string") {
			if (!isHex(value)) {
				throw new Error(`Section ${key} is not a hex payload.`);
			}
			output[key] = value;
		} else if (
			typeof value === "number" ||
			typeof value === "boolean" ||
			value === null
		) {
			output[key] = value;
		} else {
			throw new Error(
				`Section ${key} is not a value this save format carries.`,
			);
		}
	}
	if (!isJsonObject(output[BAG_KEY] ?? null)) {
		throw new Error(
			"This save has no shared bag (section ci). Open global.dat from the Chronicon save folder.",
		);
	}
	output[SECTION_KEY] = sectionRows(output);
	return output;
};

export const encodeGlobalSave = (doc: JsonValue): Bytes => {
	if (!isJsonObject(doc)) {
		throw new Error("The decoded save is not an object.");
	}
	const output: Record<string, JsonValue> = {};
	for (const [key, value] of Object.entries(doc)) {
		if (key === SECTION_KEY) continue;
		output[key] = key === BAG_KEY ? encodeBag(value) : value;
	}
	return new TextEncoder().encode(JSON.stringify(output));
};

export const bagOf = (doc: JsonValue): BagSection | undefined => {
	if (!isJsonObject(doc)) return undefined;
	const value = doc[BAG_KEY];
	if (
		value === undefined ||
		!isJsonObject(value) ||
		value.format !== "shared-bag"
	) {
		return undefined;
	}
	const version = value.version;
	const kind = value.kind;
	const entries = value.entries;
	const tail = value.tail;
	if (
		typeof version !== "number" ||
		typeof kind !== "number" ||
		!Array.isArray(entries)
	) {
		return undefined;
	}
	const parsed: BagEntry[] = [];
	for (const entry of entries) {
		if (!isJsonObject(entry)) return undefined;
		const id = entry.id;
		const quantity = entry.quantity;
		const lead = entry.lead;
		const trail = entry.trail;
		if (
			typeof id !== "number" ||
			typeof quantity !== "number" ||
			(lead !== undefined && typeof lead !== "number") ||
			(trail !== undefined && typeof trail !== "string")
		) {
			return undefined;
		}
		parsed.push({
			id,
			quantity,
			...(lead === undefined ? {} : { lead }),
			...(trail === undefined ? {} : { trail }),
		});
	}
	return {
		format: "shared-bag",
		version,
		kind,
		entries: parsed,
		...(typeof tail === "string" ? { tail } : {}),
	};
};
