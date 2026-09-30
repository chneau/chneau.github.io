/**
 * The `ScriptableSystemsContainer`: a StringPool and a list of serialised objects.
 *
 * ## What REDengine 4 stores
 *
 * Every name in these saves — field names, type names, enum values — is a
 * `CName`: a 16-bit index into a per-system string pool, not a string inline.
 * The pool itself is two regions of the blob: a table of 4-byte descriptors
 * (a 24-bit offset and an 8-bit length) followed by the bytes they point at. A
 * descriptor's length counts its own null terminator, so the stored text is one
 * byte shorter than it claims — the single easiest thing to get wrong here.
 *
 * An object is then a count, a table of `(name index, type index, byte offset)`
 * descriptors, and the field data those offsets point into. Slicing each field
 * as "from this offset to the next one" is what lets a field's bytes be read
 * without knowing its type's length in advance.
 *
 * ## Sparse struct arrays
 *
 * Attributes, proficiencies and development points are *arrays of structs* whose
 * fields are addressed relative to the start of each element rather than to the
 * array. Walking one means: read a count, then per element read its field count,
 * its descriptors and its data — then skip to where the next element starts,
 * which needs the size of the *last* field, derived from its type name.
 *
 * That last step is why `sizeOfField` refuses to guess. An unknown type name
 * means there is no way to say where the next element begins, so the walk stops
 * with what it has rather than desynchronising and reporting invented levels.
 */
import type { Bytes } from "../../shared";

/** One resolved entry of the string pool. */
export type StringPool = {
	readonly names: readonly string[];
	/** The pool entry for an index, or `undefined` when there is none. */
	at: (index: number) => string | undefined;
};

/** A field of a serialised object: its name, its declared type, its bytes. */
export type ObjectField = {
	readonly name: string;
	readonly type: string;
	readonly data: Bytes;
};

/** One object in the container, with its fields already sliced out. */
type SerialObject = {
	readonly ctypename: string;
	readonly fields: readonly ObjectField[];
	/** The field with this name, if the object has one. */
	field: (name: string) => ObjectField | undefined;
};

/** A decoded `ScriptableSystemsContainer` node. */
export type SystemsContainer = {
	readonly pool: StringPool;
	readonly objects: readonly SerialObject[];
	/** The object with this class name, if the container has one. */
	find: (ctypename: string) => SerialObject | undefined;
};

/**
 * Little-endian cursor over one blob, with the bounds checks a save needs.
 *
 * Every read goes through `slice`, which refuses to run past the end: a save
 * truncated by a bad edit should name the offset it wanted, not surface as an
 * opaque `DataView` range error.
 */
export class BlobReader {
	private at = 0;

	constructor(private readonly bytes: Bytes) {}

	get offset(): number {
		return this.at;
	}

	get length(): number {
		return this.bytes.length;
	}

	/** Moves the cursor. A caller that computed the offset has already checked it. */
	seek(offset: number): void {
		this.at = offset;
	}

	/** A `DataView` over the next `length` bytes, for a single scalar read. */
	private take(length: number): DataView {
		return new DataView(this.slice(length).buffer, 0, length);
	}

	u8(): number {
		return this.take(1).getUint8(0);
	}

	u16(): number {
		return this.take(2).getUint16(0, true);
	}

	i16(): number {
		return this.take(2).getInt16(0, true);
	}

	u32(): number {
		return this.take(4).getUint32(0, true);
	}

	i32(): number {
		return this.take(4).getInt32(0, true);
	}

	u64(): bigint {
		return this.take(8).getBigUint64(0, true);
	}

	f32(): number {
		return this.take(4).getFloat32(0, true);
	}

	/**
	 * A *borrowed* view of the next `length` bytes — a `subarray`, not a copy.
	 *
	 * This is the only way a patch reaches the caller's buffer. A field's data is
	 * handed out as a view so that writing to it writes into the node's own bytes,
	 * which is what makes an in-place edit possible at all: `readObjectFields` and
	 * `readSparseArray` both slice their input, and a slice is a *copy*, so a patch
	 * aimed at one of those would land in a temporary and be discarded.
	 *
	 * `copy()` is the counterpart, for the places that must not alias.
	 */
	view(length: number): Bytes {
		if (length < 0 || this.at + length > this.bytes.length) {
			throw new Error(
				`This save's data blob ends early: wanted ${length} byte(s) at offset ${this.at}, but only ${
					this.bytes.length - this.at
				} remain.`,
			);
		}
		const borrowed = this.bytes.subarray(this.at, this.at + length);
		this.at += length;
		return borrowed;
	}

	/** A detached copy of the next `length` bytes, for a caller that must own it. */
	slice(length: number): Bytes {
		const borrowed = this.view(length);
		const owned = new Uint8Array(borrowed.length);
		owned.set(borrowed);
		return owned;
	}
}

/**
 * The size of a field of the given type name, or `undefined` when this editor
 * does not know the type.
 *
 * The named entries are the types the reference implementation reads and writes
 * for `PlayerDevelopmentData`. The `gamedata` rule is a property of the schema
 * rather than a guess about one enum: every one of the game's own enums is
 * declared with a 16-bit index, and its names are confirmed against the game's
 * `CEnums` catalogue. Anything else is genuinely unknown.
 */
export const sizeOfField = (type: string): number | undefined => {
	switch (type) {
		case "Bool":
		case "Int8":
		case "Uint8":
			return 1;
		case "Int16":
		case "Uint16":
		case "CName":
			return 2;
		case "Int32":
		case "Uint32":
		case "Float32":
			return 4;
		case "Int64":
		case "Uint64":
		case "TweakDBID":
		case "Float64":
			return 8;
		default:
			return type.startsWith("gamedata") ? 2 : undefined;
	}
};

/**
 * Reads a struct field according to its type name.
 *
 * `undefined` means the type is one this editor does not model, and the caller
 * skips the field rather than inventing a value.
 */
export const readFieldValue = (
	reader: BlobReader,
	type: string,
	pool: StringPool,
): number | bigint | boolean | string | undefined => {
	if (type === "Bool") return reader.u8() !== 0;
	if (type === "Int32") return reader.i32();
	if (type === "Uint32") return reader.u32();
	if (type === "Int16") return reader.i16();
	if (type === "Uint16") return reader.u16();
	if (type === "Uint64" || type === "TweakDBID") return reader.u64();
	if (type === "CName" || type.startsWith("gamedata")) {
		return pool.at(reader.u16()) ?? "";
	}
	return undefined;
};

/**
 * Writes a scalar back at `offset` in `blob`, according to its type name.
 *
 * Returns false for a type whose bytes are not a plain scalar, so a caller can
 * leave an unfamiliar field alone rather than corrupt it. Writing in place is
 * only ever done for a field whose size does not depend on the value, so the
 * surrounding blob keeps its length and every other offset in it stays valid.
 */
export const writeFieldValue = (
	blob: Bytes,
	offset: number,
	type: string,
	value: number | bigint | boolean,
): boolean => {
	const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
	if (type === "Bool") {
		view.setUint8(offset, value === true || value === 1 ? 1 : 0);
		return true;
	}
	if (type === "Int32") {
		view.setInt32(offset, Number(value), true);
		return true;
	}
	if (type === "Uint32") {
		view.setUint32(offset, Number(value) >>> 0, true);
		return true;
	}
	if (type === "Int16") {
		view.setInt16(offset, Number(value), true);
		return true;
	}
	if (type === "Uint16") {
		view.setUint16(offset, Number(value), true);
		return true;
	}
	if (type === "Uint64" || type === "TweakDBID") {
		view.setBigUint64(offset, BigInt(value), true);
		return true;
	}
	return false;
};

/** One `(name index, type index, data offset)` descriptor. */
type FieldDescriptor = {
	name: string;
	type: string;
	dataOffset: number;
};

/**
 * Reads the string pool: a descriptor table followed by the bytes it points at.
 *
 * Both halves are positioned relative to the pool's own base — the descriptor
 * table starts there and the strings begin after it — so a descriptor's offset
 * is added to that base rather than to the blob's. The length in the top byte
 * counts the null terminator, which is not part of the text.
 *
 * `descsSize` is the table's byte length and `dataSize` the text region's, which
 * together bound every entry: an offset pointing past them is a corrupt or
 * misread table, and is reported rather than clamped, because a clamped name
 * would silently identify the wrong field.
 */
const readPool = (
	blob: Bytes,
	base: number,
	descsSize: number,
	dataSize: number,
): StringPool => {
	if (descsSize % 4 !== 0) {
		throw new Error(
			"This save's string pool has a descriptor table that is not a whole number of entries.",
		);
	}
	const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
	const dataEnd = base + descsSize + dataSize;
	const names: string[] = [];
	const count = Math.floor(descsSize / 4);
	for (let index = 0; index < count; index += 1) {
		const packed = view.getUint32(base + index * 4, true);
		const offset = packed & 0x00ffffff;
		const size = ((packed >>> 24) & 0xff) - 1;
		const start = base + offset;
		if (size < 0 || start + size > dataEnd || start + size > blob.length) {
			throw new Error(
				`Entry ${index} of this save's string pool points outside the blob.`,
			);
		}
		names.push(new TextDecoder().decode(blob.slice(start, start + size)));
	}
	return {
		names,
		at: (index: number): string | undefined => {
			if (index < 0) return undefined;
			return names[index];
		},
	};
};

/**
 * Reads one object's fields.
 *
 * A field runs from its own offset to the next descriptor's, or to the end of
 * the object's slice for the last one: the format stores no length, so this
 * adjacency is the only way to bound a field.
 */
const readObjectFields = (
	blob: Bytes,
	pool: StringPool,
): readonly ObjectField[] => {
	const reader = new BlobReader(blob);
	if (reader.length === 0) return [];
	const fieldCount = reader.u16();
	const descriptors: FieldDescriptor[] = [];
	for (let index = 0; index < fieldCount; index += 1) {
		descriptors.push({
			name: pool.at(reader.u16()) ?? "",
			type: pool.at(reader.u16()) ?? "",
			dataOffset: reader.u32(),
		});
	}
	// A field's bytes are handed out as a *view* into the blob, not a copy, so a
	// patch written through one reaches the node's own buffer. That is what makes
	// an in-place edit possible without re-serialising the object — and re-
	// serialising would move every offset in it.
	return descriptors.map((descriptor, position) => {
		const next = descriptors[position + 1]?.dataOffset ?? blob.length;
		const reader = new BlobReader(blob);
		reader.seek(Math.min(Math.max(0, descriptor.dataOffset), blob.length));
		return {
			name: descriptor.name,
			type: descriptor.type,
			data: reader.view(
				Math.max(
					0,
					Math.min(next, blob.length) -
						Math.min(Math.max(0, descriptor.dataOffset), blob.length),
				),
			),
		};
	});
};

/** Indexes the objects by class name. The first of a class wins. */
const indexByType = (
	objects: readonly SerialObject[],
): Map<string, SerialObject> => {
	const byType = new Map<string, SerialObject>();
	for (const object of objects) {
		// First one wins: a save can hold several objects of one class and the
		// game addresses the first, so the later ones are not merged in.
		if (object.ctypename !== "" && !byType.has(object.ctypename)) {
			byType.set(object.ctypename, object);
		}
	}
	return byType;
};

/**
 * Reads a `ScriptableSystemsContainer` blob.
 *
 * The blob opens with its own size, then six header words saying where the pool
 * and the object table sit inside it. Every offset is relative to the blob's own
 * start, so the bytes the header already consumed are added back on — which is
 * what stops a prefix from shifting every field by its own length.
 *
 * Ahead of the pool, a handle count above one means the blob carries one 64-bit
 * subsystem handle per entry. A count of one means there are none, which is the
 * usual case for a single-system node.
 */
export const readSystemsContainer = (blob: Bytes): SystemsContainer => {
	const reader = new BlobReader(blob);
	const blobSize = reader.u32();
	if (blobSize <= 0 || blobSize > blob.length) {
		throw new Error(
			`This save's systems blob claims to be ${blobSize} bytes, but its node holds ${blob.length}.`,
		);
	}

	reader.u16(); // Two unknown words the game writes here.
	reader.u16();
	const cnamesCount = reader.u32();
	const strpoolDescsOffset = reader.u32();
	const strpoolDataOffset = reader.u32();
	const objDescsOffset = reader.u32();
	const objdataOffset = reader.u32();

	if (cnamesCount > 1) {
		const declared = reader.u32();
		if (declared !== cnamesCount) {
			throw new Error(
				"This save's systems blob disagrees with itself about its subsystem handle count.",
			);
		}
		for (let index = 0; index < declared; index += 1) reader.u64();
	}
	const baseOffset = reader.offset;
	const at = (offset: number): number => baseOffset + offset;

	const pool = readPool(
		blob,
		at(strpoolDescsOffset),
		strpoolDataOffset,
		objDescsOffset - strpoolDataOffset,
	);

	const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
	const descriptorsAt = at(objDescsOffset);
	const objectCount = Math.floor((objdataOffset - objDescsOffset) / 8);
	const objDescs: { nameIndex: number; dataOffset: number }[] = [];
	for (let index = 0; index < objectCount; index += 1) {
		objDescs.push({
			nameIndex: view.getUint32(descriptorsAt + index * 8, true),
			dataOffset: view.getUint32(descriptorsAt + index * 8 + 4, true),
		});
	}

	const end = baseOffset + blobSize;
	const objects: SerialObject[] = [];
	const bounds = new BlobReader(blob);
	for (const [index, descriptor] of objDescs.entries()) {
		const next = objDescs[index + 1];
		const from = Math.min(Math.max(0, at(descriptor.dataOffset)), blob.length);
		const to = Math.min(
			Math.max(0, next === undefined ? end : at(next.dataOffset)),
			blob.length,
		);
		// A view, so that a field inside it is a view into the node's own bytes
		// and a patch written through the field reaches the buffer the container
		// will re-serialise.
		bounds.seek(from);
		const slice = bounds.view(Math.max(0, to - from));
		const fields = readObjectFields(slice, pool);
		const byName = new Map(fields.map((entry) => [entry.name, entry]));
		objects.push({
			ctypename: pool.at(descriptor.nameIndex) ?? "",
			fields,
			field: (name: string): ObjectField | undefined => byName.get(name),
		});
	}

	const byType = indexByType(objects);
	return {
		pool,
		objects,
		find: (ctypename: string): SerialObject | undefined =>
			byType.get(ctypename),
	};
};

/** One element of a sparse struct array, with its fields resolved. */
export type SparseEntry = {
	/** The element's `type` field, or `""` when it has none. */
	readonly type: string;
	readonly values: ReadonlyMap<string, number | bigint | boolean | string>;
	/**
	 * Where each field's bytes start, so a value can be rewritten in place
	 * without re-serialising the array — which would move every offset in it.
	 */
	readonly offsets: ReadonlyMap<string, number>;
};

/**
 * Reads a `u32`-counted array of self-describing structs.
 *
 * The walk stops early when an element's last field has a type this editor does
 * not know, because an element's length is only knowable from that field and a
 * wrong guess would shift every element after it. Stopping leaves the caller
 * with the elements that were certainly correct.
 */
export const readSparseArray = (
	blob: Bytes,
	pool: StringPool,
): readonly SparseEntry[] => {
	const reader = new BlobReader(blob);
	const count = reader.u32();
	// A count beyond the blob's own size is a corrupt or misread field, and
	// iterating it would be a very long loop.
	if (count > blob.length) {
		throw new Error(
			`This save's struct array claims ${count} elements, which its ${blob.length} bytes cannot hold.`,
		);
	}
	const entries: SparseEntry[] = [];
	for (let element = 0; element < count; element += 1) {
		const elementAt = reader.offset;
		const fieldCount = reader.u16();
		const descriptors: FieldDescriptor[] = [];
		for (let index = 0; index < fieldCount; index += 1) {
			descriptors.push({
				name: pool.at(reader.u16()) ?? "",
				type: pool.at(reader.u16()) ?? "",
				dataOffset: reader.u32(),
			});
		}

		const values = new Map<string, number | bigint | boolean | string>();
		const offsets = new Map<string, number>();
		for (const descriptor of descriptors) {
			if (sizeOfField(descriptor.type) === undefined) continue;
			offsets.set(descriptor.name, elementAt + descriptor.dataOffset);
			reader.seek(elementAt + descriptor.dataOffset);
			const value = readFieldValue(reader, descriptor.type, pool);
			if (value !== undefined) values.set(descriptor.name, value);
		}

		const last = descriptors[descriptors.length - 1];
		const lastSize = last === undefined ? undefined : sizeOfField(last.type);
		if (last === undefined || lastSize === undefined) break;
		entries.push({
			type: String(values.get("type") ?? ""),
			values,
			offsets,
		});
		reader.seek(elementAt + last.dataOffset + lastSize);
	}
	return entries;
};
