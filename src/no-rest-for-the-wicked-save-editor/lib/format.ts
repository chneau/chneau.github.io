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
	type PathSegment,
	type QuickAction,
	type SaveCodec,
	type SaveEdit,
	type SavePath,
	type SummaryRow,
} from "../../shared";
import { hex64, xxHash64 } from "./xxhash";

/** The seven ASCII bytes that start every CERIMAL document. */
const MAGIC = "CERIMAL";

/** The exact text a save uses to introduce its base64 payload. */
const PAYLOAD_KEY = '"binaryInfo":"';

/**
 * The well-known type ids CERIMAL gives primitives, in the order the schema
 * stores them. These are the format's own vocabulary — the names a
 * `Quantum.*` field's type prints as — so they are spelled as the game spells
 * them rather than renamed.
 */
const TYPE_BOOL = 0;
const TYPE_SBYTE = 1;
const TYPE_BYTE = 2;
const TYPE_SHORT = 3;
const TYPE_USHORT = 4;
const TYPE_INT = 5;
const TYPE_UINT = 6;
const TYPE_LONG = 7;
const TYPE_ULONG = 8;
const TYPE_NINT = 9;
const TYPE_NUINT = 10;
const TYPE_CHAR = 11;
const TYPE_DOUBLE = 12;
const TYPE_FLOAT = 13;
const TYPE_DECIMAL = 14;
const TYPE_GUID = 15;
const TYPE_STRING = 16;
const TYPE_FP = 17;
const TYPE_ASSET_GUID = 18;
const TYPE_LFP = 19;

/** Display names, indexed by the ids above. */
const TYPE_NAMES: readonly string[] = [
	"BOOL",
	"SBYTE",
	"BYTE",
	"SHORT",
	"USHORT",
	"INT",
	"UINT",
	"LONG",
	"ULONG",
	"NINT",
	"NUINT",
	"CHAR",
	"DOUBLE",
	"FLOAT",
	"DECIMAL",
	"GUID",
	"STRING",
	"FP",
	"ASSETGUID",
	"LFP",
];

/** Size in bytes, indexed by the ids above; 0 where the type is not fixed width. */
const TYPE_SIZE: readonly number[] = [
	1, 1, 1, 2, 2, 4, 4, 8, 8, 8, 8, 2, 8, 4, 16, 16, 0, 8, 8, 4,
];

/** Alignment in bytes, indexed by the ids above. */
const TYPE_ALIGN: readonly number[] = [
	1, 1, 1, 2, 2, 4, 4, 8, 8, 8, 8, 2, 8, 4, 4, 4, 0, 8, 8, 4,
];

/** The integer widths an enum's underlying type can take, in stored order. */
const ENUM_UNDERLYING: readonly string[] = [
	"u8",
	"i8",
	"u16",
	"i16",
	"u32",
	"i32",
	"u64",
	"i64",
];

/** The four kinds of type definition, in the order the schema stores them. */
const DEFINITION_KINDS = ["class", "struct", "unmanaged", "enum"] as const;

type DefinitionKind = (typeof DEFINITION_KINDS)[number];

/** The root type of a character save: the one document that holds the player. */
const PLAYER_ROOT_TYPE = "Quantum.PlayerSerializedData";

/** The root type of a realm save, which holds the world rather than a player. */
const REALM_ROOT_TYPE = "Quantum.GameSaveData";

// ---------------------------------------------------------------------------
// The type model
// ---------------------------------------------------------------------------

/**
 * A reference to a type, as the schema stores it.
 *
 * `primitive` carries a well-known id, `array` a rank and an element, and
 * `named` a GUID with any generic arguments. `typeArgument` is a forward
 * reference to one of those arguments, resolved against the enclosing
 * reference before it is used.
 */
type TypeRef =
	| { readonly kind: "primitive"; readonly wellKnown: number }
	| {
			readonly kind: "array";
			readonly rank: number;
			readonly element: TypeRef;
	  }
	| { readonly kind: "typeArgument"; readonly index: number }
	| {
			readonly kind: "named";
			readonly guid: Uint8Array;
			readonly guidText: string;
			readonly typeArgs: readonly TypeRef[];
	  };

/** A field, list or dictionary declared by a class. */
type ClassMember =
	| { readonly kind: "field"; readonly name: string; readonly typeRef: TypeRef }
	| { readonly kind: "list"; readonly elementType: TypeRef }
	| {
			readonly kind: "dict";
			readonly keyType: TypeRef;
			readonly valueType: TypeRef;
	  };

/** A field declared by a struct or an unmanaged type. */
type StructMember = {
	readonly name: string;
	readonly typeRef: TypeRef;
};

type EnumVariant = {
	readonly name: string;
	readonly value: number | bigint;
};

/**
 * The base-type and interface block of a class definition.
 *
 * `tail` is the part of the block this parser does not model. Every save
 * committed so far declares no interfaces and leaves it empty, but a byte that
 * is read and then thrown away cannot be written back, so it is carried.
 */
type BaseBlock = {
	readonly rawFlags: number;
	readonly bodySize: number;
	readonly hasBase: boolean;
	readonly interfaceCount: number;
	readonly baseTypeRef: TypeRef | null;
	readonly tail: Uint8Array;
};

/**
 * One type definition.
 *
 * `kind` keeps the file's own discriminator: `struct` and `unmanaged` lay a
 * value out identically but are stored under different ids, so they are kept
 * apart rather than merged.
 */
type TypeDefinition = {
	readonly kind: DefinitionKind;
	/** The flags word as read, so any bit this parser does not know survives. */
	readonly rawFlags: number;
	readonly guid: Uint8Array;
	readonly guidText: string;
	readonly localVersion: number;
	readonly name: string;
	readonly base: BaseBlock | null;
	readonly members: readonly (ClassMember | StructMember | EnumVariant)[];
	/** The integer type behind an `enum`; empty for the other kinds. */
	readonly underlying: string;
	/**
	 * The byte an `enum` stored its underlying type in, verbatim.
	 *
	 * Only its low three bits mean anything to this parser — real saves write
	 * 12 for a 32-bit enum, not the 4 that indexes the table — so the whole byte
	 * is carried rather than an index reconstructed from it.
	 */
	readonly underlyingRaw: number;
};

/** The whole type graph, plus the index that turns a GUID into a definition. */
type Schema = {
	readonly globalVersion: number;
	readonly definitions: readonly TypeDefinition[];
	readonly rootTypeRef: TypeRef;
	readonly byGuid: ReadonlyMap<string, number>;
	readonly byName: ReadonlyMap<string, number>;
};

/** The header of one document, as read from the stream. */
type DocumentHeader = {
	readonly version: number;
	readonly compression: number;
	readonly checksum: bigint;
	readonly schemaSize: number;
	readonly contentSize: number;
};

/** One decoded CERIMAL document, on its way to being a JSON document. */
type DecodedDocument = {
	readonly header: DocumentHeader;
	readonly rootType: string;
	readonly data: JsonValue;
	/** Paths of the values the file put into the back-reference table. */
	readonly registered: readonly SavePath[];
	/** The dimensions of every array whose rank is above one, by path. */
	readonly dimensions: readonly (readonly [SavePath, readonly number[]])[];
	readonly schema: Schema;
	/** The schema section exactly as read, which the document carries forward. */
	readonly schemaBytes: Uint8Array;
};

/**
 * The document this codec decodes to and encodes from.
 *
 * `$cerimal` is one key rather than a bare envelope because a save holds three
 * different things — the envelope's own metadata, the wrapper text either side
 * of the base64 payload, and the decoded documents — and the editor has to be
 * able to show all of them and rebuild all of them.
 */
type CerimalDocumentView = {
	readonly rootType: string;
	readonly version: number;
	/** The format's compression field; 0 is stored, 1 is Zstandard. */
	readonly compression: number;
	/** The schema section, base64. Carried because JSON cannot express types. */
	readonly schema: string;
	/**
	 * Paths of the values the file put into the back-reference table, in the
	 * order it did so. A value may be referenced many times over; only the
	 * registration has to be recorded, because a reference is recognised by
	 * the re-encoder as the same object appearing a second time.
	 */
	readonly registered: readonly SavePath[];
	/**
	 * The extents of every multi-dimensional array, by path. A rank of one is
	 * recoverable from the number of elements; anything higher is not, because
	 * the elements are stored flattened.
	 */
	readonly dimensions: readonly (readonly [SavePath, readonly number[]])[];
	readonly data: JsonValue;
};

export type CerimalFile = {
	readonly $cerimal: {
		readonly envelope: { readonly [key: string]: JsonValue };
		/**
		 * The exact characters of the file before the base64 payload — the
		 * whole file, when it has no payload. `wrapperAfter` is empty in that
		 * case, which is how a save with no CERIMAL section is told apart.
		 */
		readonly wrapperBefore: string;
		readonly wrapperAfter: string;
		readonly documents: readonly CerimalDocumentView[];
	};
};

// ---------------------------------------------------------------------------
// Little-endian byte plumbing
// ---------------------------------------------------------------------------

/**
 * CERIMAL is little-endian throughout, which is the opposite of the shared
 * `ByteReader` (Unreal's format is big-endian), so this is a second reader
 * rather than a configuration flag on the first. Every read is bounds-checked:
 * a truncated save is the common failure and the message is worth having.
 */
class LeReader {
	private readonly view: DataView;
	private at: number;

	constructor(
		private readonly bytes: Uint8Array,
		start = 0,
	) {
		this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		this.at = start;
	}

	get position(): number {
		return this.at;
	}

	/** Jumps the cursor, used to honour a length the format declared. */
	seek(at: number): void {
		if (at < 0 || at > this.bytes.length) {
			throw new Error(
				`A length field in the CERIMAL stream pointed outside it: ${at} of ${this.bytes.length} bytes.`,
			);
		}
		this.at = at;
	}

	get remaining(): number {
		return this.bytes.length - this.at;
	}

	private take(length: number, what: string): number {
		if (this.at + length > this.bytes.length) {
			throw new Error(
				`Truncated CERIMAL stream: wanted ${length} byte(s) for ${what} at offset ${this.at}, but only ${this.remaining} remain.`,
			);
		}
		const at = this.at;
		this.at += length;
		return at;
	}

	u8(what = "a byte"): number {
		return this.view.getUint8(this.take(1, what));
	}

	i8(what = "a byte"): number {
		return this.view.getInt8(this.take(1, what));
	}

	u16(what = "a 16-bit value"): number {
		return this.view.getUint16(this.take(2, what), true);
	}

	i16(what = "a 16-bit value"): number {
		return this.view.getInt16(this.take(2, what), true);
	}

	u32(what = "a 32-bit value"): number {
		return this.view.getUint32(this.take(4, what), true);
	}

	i32(what = "a 32-bit value"): number {
		return this.view.getInt32(this.take(4, what), true);
	}

	u64(what = "a 64-bit value"): bigint {
		return this.view.getBigUint64(this.take(8, what), true);
	}

	i64(what = "a 64-bit value"): bigint {
		return this.view.getBigInt64(this.take(8, what), true);
	}

	f32(what = "a 32-bit float"): number {
		return this.view.getFloat32(this.take(4, what), true);
	}

	f64(what = "a 64-bit float"): number {
		return this.view.getFloat64(this.take(8, what), true);
	}

	/**
	 * A view of `length` bytes, not a copy. Callers that hold on to one — the
	 * schema's unmodelled tail — therefore keep a view of the file, which is
	 * the point: the alternative is a copy of every one of them.
	 */
	slice(length: number, what = "raw bytes"): Uint8Array {
		const at = this.take(length, what);
		return this.bytes.subarray(at, at + length);
	}

	/**
	 * The format's variable-length integer: seven payload bits per byte, the
	 * high bit set on every byte but the last. Used for lengths, counts, array
	 * dimensions and node tags.
	 */
	sevenBit(what = "a 7-bit integer"): number {
		let value = 0;
		let shift = 0;
		for (;;) {
			const byte = this.u8(what);
			// `|=` rather than `+=`, because a shift past 31 contributes
			// nothing and would silently truncate a large count.
			value |= (byte & 0x7f) << shift;
			if ((byte & 0x80) === 0) return value;
			shift += 7;
			if (shift > 28) {
				throw new Error(`${what} is longer than this format allows.`);
			}
		}
	}

	/** A length byte then that many UTF-8 bytes: a member or variant name. */
	name(what = "a name"): string {
		return new TextDecoder().decode(
			this.slice(this.u8(`${what} length`), what),
		);
	}

	/** A 7-bit length then that many UTF-8 bytes: a type name. */
	sevenBitName(what = "a name"): string {
		return new TextDecoder().decode(
			this.slice(this.sevenBit(`${what} length`), what),
		);
	}
}

/** The mirror of `LeReader`, growing as it writes. */
class LeWriter {
	private buffer: Uint8Array;
	private view: DataView;
	private at = 0;

	constructor(capacity = 1024) {
		this.buffer = new Uint8Array(capacity);
		this.view = new DataView(this.buffer.buffer);
	}

	get length(): number {
		return this.at;
	}

	private ensure(extra: number): void {
		if (this.at + extra <= this.buffer.length) return;
		let size = this.buffer.length * 2;
		while (size < this.at + extra) size *= 2;
		const grown = new Uint8Array(size);
		grown.set(this.buffer);
		this.buffer = grown;
		this.view = new DataView(grown.buffer);
	}

	u8(value: number): this {
		this.ensure(1);
		this.view.setUint8(this.at, value);
		this.at += 1;
		return this;
	}

	i8(value: number): this {
		this.ensure(1);
		this.view.setInt8(this.at, value);
		this.at += 1;
		return this;
	}

	u16(value: number): this {
		this.ensure(2);
		this.view.setUint16(this.at, value, true);
		this.at += 2;
		return this;
	}

	i16(value: number): this {
		this.ensure(2);
		this.view.setInt16(this.at, value, true);
		this.at += 2;
		return this;
	}

	u32(value: number): this {
		this.ensure(4);
		this.view.setUint32(this.at, value, true);
		this.at += 4;
		return this;
	}

	i32(value: number): this {
		this.ensure(4);
		this.view.setInt32(this.at, value, true);
		this.at += 4;
		return this;
	}

	u64(value: bigint): this {
		this.ensure(8);
		this.view.setBigUint64(this.at, value, true);
		this.at += 8;
		return this;
	}

	i64(value: bigint): this {
		this.ensure(8);
		this.view.setBigInt64(this.at, value, true);
		this.at += 8;
		return this;
	}

	f32(value: number): this {
		this.ensure(4);
		this.view.setFloat32(this.at, value, true);
		this.at += 4;
		return this;
	}

	f64(value: number): this {
		this.ensure(8);
		this.view.setFloat64(this.at, value, true);
		this.at += 8;
		return this;
	}

	raw(value: Uint8Array): this {
		this.ensure(value.length);
		this.buffer.set(value, this.at);
		this.at += value.length;
		return this;
	}

	/**
	 * Rewrites a field already written. The header's three lengths, the
	 * checksum and each definition's own size are all known only once the block
	 * they describe has been laid out, and the format stores all five first.
	 */
	patchU32(at: number, value: number): void {
		this.view.setUint32(at, value, true);
	}

	patchU64(at: number, value: bigint): void {
		this.view.setBigUint64(at, value, true);
	}

	/** Everything written so far, from `at` onwards, for hashing in place. */
	writtenFrom(at: number): Uint8Array {
		return this.buffer.subarray(at, this.at);
	}

	sevenBit(value: number): this {
		let rest = value >>> 0;
		while (rest >= 0x80) {
			this.u8((rest & 0x7f) | 0x80);
			rest = rest >>> 7;
		}
		return this.u8(rest);
	}

	/** A length byte then the UTF-8 bytes, which is how the schema stores names. */
	name(value: string): this {
		const encoded = new TextEncoder().encode(value);
		if (encoded.length > 0xff) {
			throw new Error(
				`A CERIMAL member name is one length byte long; "${value}" is ${encoded.length} bytes.`,
			);
		}
		return this.u8(encoded.length).raw(encoded);
	}

	/** A 7-bit length then the UTF-8 bytes: how a type name is stored. */
	sevenBitName(value: string): this {
		const encoded = new TextEncoder().encode(value);
		return this.sevenBit(encoded.length).raw(encoded);
	}

	finish(): Uint8Array {
		return this.buffer.slice(0, this.at);
	}
}

/**
 * The 16 raw bytes of a GUID as the text .NET prints it.
 *
 * .NET's `Guid` is mixed-endian — the first three groups are little-endian — and
 * every tool that reads a game save has to reproduce that, or every identifier
 * in the inspector is subtly wrong.
 */
const formatGuid = (bytes: Uint8Array): string => {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const hex = (value: number, width: number): string =>
		value.toString(16).padStart(width, "0");
	const tail = Array.from(bytes.subarray(8, 16))
		.map((byte) => hex(byte, 2))
		.join("");
	return [
		hex(view.getUint32(0, true), 8),
		hex(view.getUint16(4, true), 4),
		hex(view.getUint16(6, true), 4),
		tail.slice(0, 4),
		tail.slice(4),
	].join("-");
};

/** The inverse of `formatGuid`, for writing an identifier the user has edited. */
const parseGuid = (text: string): Uint8Array => {
	const groups = text.split("-");
	if (groups.length !== 5) {
		throw new Error(`"${text}" is not a GUID.`);
	}
	const [first, second, third, fourth, fifth] = groups;
	if (
		first === undefined ||
		second === undefined ||
		third === undefined ||
		fourth === undefined ||
		fifth === undefined
	) {
		throw new Error(`"${text}" is not a GUID.`);
	}
	if (
		!/^[0-9a-fA-F]{8}$/.test(first) ||
		!/^[0-9a-fA-F]{4}$/.test(second) ||
		!/^[0-9a-fA-F]{4}$/.test(third) ||
		!/^[0-9a-fA-F]{4}$/.test(fourth) ||
		!/^[0-9a-fA-F]{12}$/.test(fifth)
	) {
		throw new Error(`"${text}" is not a GUID.`);
	}
	const bytes = new Uint8Array(16);
	const view = new DataView(bytes.buffer);
	// The first three groups are stored little-endian; the rest as they read.
	view.setUint32(0, Number.parseInt(first, 16), true);
	view.setUint16(4, Number.parseInt(second, 16), true);
	view.setUint16(6, Number.parseInt(third, 16), true);
	const rest = `${fourth}${fifth}`;
	for (let index = 0; index < 8; index += 1) {
		bytes[8 + index] = Number.parseInt(
			rest.slice(index * 2, index * 2 + 2),
			16,
		);
	}
	return bytes;
};

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/** Resolves a forward reference to one of a named type's generic arguments. */
const resolveTypeArgument = (
	ref: TypeRef,
	typeArgs: readonly TypeRef[] | undefined,
): TypeRef => {
	if (ref.kind !== "typeArgument") return ref;
	return typeArgs?.[ref.index] ?? ref;
};

/** Renders a type reference the way a schema prints it, for display. */
const formatTypeRef = (ref: TypeRef, schema: Schema): string => {
	switch (ref.kind) {
		case "primitive":
			return TYPE_NAMES[ref.wellKnown] ?? `UNKNOWN(${ref.wellKnown})`;
		case "array": {
			const commas = ",".repeat(Math.max(0, ref.rank - 1));
			return `${formatTypeRef(ref.element, schema)}[${commas}]`;
		}
		case "typeArgument":
			return `T${ref.index}`;
		case "named": {
			const index = schema.byGuid.get(ref.guidText);
			const name =
				index === undefined ? ref.guidText : definitionName(schema, index);
			return ref.typeArgs.length === 0
				? name
				: `${name}<${ref.typeArgs
						.map((argument) => formatTypeRef(argument, schema))
						.join(", ")}>`;
		}
	}
};

const definitionName = (schema: Schema, index: number): string =>
	schema.definitions[index]?.name ?? `type#${index}`;

/** Splits a printed type's generic arguments on the commas between them. */
const splitArguments = (text: string): readonly string[] => {
	const parts: string[] = [];
	let depth = 0;
	let start = 0;
	for (let index = 0; index < text.length; index += 1) {
		const character = text[index];
		if (character === "<") depth += 1;
		else if (character === ">") depth -= 1;
		else if (character === "," && depth === 0) {
			parts.push(text.slice(start, index));
			start = index + 1;
		}
	}
	parts.push(text.slice(start));
	return parts;
};

/**
 * The named type a printed name refers to, GUID and all.
 *
 * A *runtime type override* — a node whose tag says "this value is really that
 * type" rather than the one its field declared — survives into the document as
 * a name, and one real realm save holds twelve thousand of them. The schema is
 * carried whole, so the name is enough to find the GUID behind it.
 */
const namedFromName = (name: string, schema: Schema): TypeRef => {
	const index = schema.byName.get(name);
	const definition =
		index === undefined ? undefined : schema.definitions[index];
	if (!definition) {
		throw new Error(`"${name}" is not a type this save's schema declares.`);
	}
	return {
		kind: "named",
		guid: definition.guid,
		guidText: definition.guidText,
		typeArgs: [],
	};
};

/**
 * Reads back the text `formatTypeRef` writes.
 *
 * The inverse of that function by construction, which is the point: the two are
 * what let a realm save's overrides survive a decode and an encode unchanged.
 * `Name` is a named type, `INT` a primitive, `T0` a generic argument and `[]`
 * an array extent, so `Dictionary<Quantum.Key, INT>[]` reads back as itself.
 */
const parseTypeRefText = (text: string, schema: Schema, depth = 0): TypeRef => {
	if (depth > 16) {
		throw new Error(`The type "${text}" nests its arguments too deeply.`);
	}
	let head = text.trim();
	let rank = 1;
	if (head.endsWith("]")) {
		const open = head.lastIndexOf("[");
		const commas = head.slice(open + 1, -1);
		if (open < 0 || !/^,*$/.test(commas)) {
			throw new Error(`"${text}" is not a type this editor can write.`);
		}
		rank = commas.length + 1;
		head = head.slice(0, open);
	}
	const angle = head.indexOf("<");
	if (angle >= 0 && !head.endsWith(">")) {
		throw new Error(`"${text}" is not a type this editor can write.`);
	}
	const name = angle < 0 ? head : head.slice(0, angle);
	const typeArgs =
		angle < 0
			? []
			: splitArguments(head.slice(angle + 1, -1)).map((argument) =>
					parseTypeRefText(argument, schema, depth + 1),
				);
	let base: TypeRef;
	if (/^T\d+$/.test(name)) {
		base = { kind: "typeArgument", index: Number(name.slice(1)) };
	} else {
		const wellKnown = TYPE_NAMES.indexOf(name);
		base =
			wellKnown >= 0
				? { kind: "primitive", wellKnown }
				: namedFromName(name, schema);
		if (base.kind === "named" && typeArgs.length > 0) {
			base = { ...base, typeArgs };
		}
	}
	// An array wraps whatever it was written around, so the extent is applied
	// last: `Foo<INT>[]` is an array of a named type, not a named array type.
	return rank > 1 ? { kind: "array", rank, element: base } : base;
};

const definitionFor = (schema: Schema, ref: TypeRef): TypeDefinition => {
	if (ref.kind !== "named") {
		throw new Error(`Expected a named type, found a ${ref.kind} reference.`);
	}
	const index = schema.byGuid.get(ref.guidText);
	const definition =
		index === undefined ? undefined : schema.definitions[index];
	if (definition === undefined) {
		throw new Error(
			`The schema uses a type it never declared: ${ref.guidText}.`,
		);
	}
	return definition;
};

const readTypeRef = (reader: LeReader): TypeRef => {
	const header = reader.u8("a type reference");
	const kind = header & 0x3;
	if (kind === 0) return { kind: "primitive", wellKnown: header >> 3 };
	if (kind === 1) {
		return { kind: "array", rank: header >> 3, element: readTypeRef(reader) };
	}
	if (kind === 2) return { kind: "typeArgument", index: header >> 3 };
	const guid = reader.slice(16, "a type GUID");
	const typeArgs: TypeRef[] = [];
	for (let index = 0; index < header >> 3; index += 1) {
		typeArgs.push(readTypeRef(reader));
	}
	return { kind: "named", guid, guidText: formatGuid(guid), typeArgs };
};

const writeTypeRef = (writer: LeWriter, ref: TypeRef): void => {
	switch (ref.kind) {
		case "primitive":
			writer.u8(ref.wellKnown << 3);
			return;
		case "array":
			writer.u8((ref.rank << 3) | 1);
			writeTypeRef(writer, ref.element);
			return;
		case "typeArgument":
			writer.u8((ref.index << 3) | 2);
			return;
		case "named": {
			writer.u8((ref.typeArgs.length << 3) | 3);
			writer.raw(ref.guid);
			for (const argument of ref.typeArgs) writeTypeRef(writer, argument);
			return;
		}
	}
};

const readEnumValue = (
	reader: LeReader,
	underlying: string,
): number | bigint => {
	switch (underlying) {
		case "u8":
			return reader.u8("an enum value");
		case "i8":
			return reader.i8("an enum value");
		case "u16":
			return reader.u16("an enum value");
		case "i16":
			return reader.i16("an enum value");
		case "u32":
			return reader.u32("an enum value");
		case "i32":
			return reader.i32("an enum value");
		case "u64":
			return reader.u64("an enum value");
		default:
			return reader.i64("an enum value");
	}
};

const writeEnumValue = (
	writer: LeWriter,
	underlying: string,
	value: number | bigint,
): void => {
	const wide = typeof value === "bigint" ? value : BigInt(Math.trunc(value));
	switch (underlying) {
		case "u8":
			writer.u8(Number(wide & 0xffn));
			return;
		case "i8":
			writer.i8(Number(BigInt.asIntN(8, wide)));
			return;
		case "u16":
			writer.u16(Number(wide & 0xffffn));
			return;
		case "i16":
			writer.i16(Number(BigInt.asIntN(16, wide)));
			return;
		case "u32":
			writer.u32(Number(wide & 0xffffffffn));
			return;
		case "i32":
			writer.i32(Number(BigInt.asIntN(32, wide)));
			return;
		case "u64":
			writer.u64(wide);
			return;
		default:
			writer.i64(wide);
	}
};

/** The width of an enum's underlying type, which its size and alignment follow. */
const enumSize = (underlying: string): number => {
	if (underlying === "u8" || underlying === "i8") return 1;
	if (underlying === "u16" || underlying === "i16") return 2;
	if (underlying === "u64" || underlying === "i64") return 8;
	return 4;
};

const readTypeDefinition = (reader: LeReader): TypeDefinition => {
	const start = reader.position;
	const bodySize = reader.u32("a type definition's size");
	// The size field itself, the flags, the local version and the GUID: 28
	// bytes of header in all, which the recorded body size is measured from.
	const end = start + 28 + bodySize;
	const rawFlags = reader.u32("a type definition's flags");
	const kind = DEFINITION_KINDS[rawFlags & 0x3];
	if (kind === undefined) {
		throw new Error(
			`A type definition declared an unknown kind ${rawFlags & 0x3}.`,
		);
	}
	const hasBase = (rawFlags & 0x4) !== 0;
	const memberCount = (rawFlags >> 8) & 0x00ffffff;
	const localVersion = reader.u32("a type definition's version");
	const guid = reader.slice(16, "a type GUID");

	let base: BaseBlock | null = null;
	if (hasBase) {
		const rawBaseFlags = reader.u32("a base-type block");
		const declaredSize = rawBaseFlags & 0x00ffffff;
		const body = reader.slice(
			Math.max(0, declaredSize - 4),
			"a base-type block",
		);
		const bodyReader = new LeReader(body);
		const hasBaseType = (rawBaseFlags & 0x01000000) !== 0;
		const baseTypeRef = hasBaseType ? readTypeRef(bodyReader) : null;
		base = {
			rawFlags: rawBaseFlags,
			bodySize: declaredSize,
			hasBase: hasBaseType,
			interfaceCount: rawBaseFlags >>> 25,
			baseTypeRef,
			tail: body.slice(bodyReader.position),
		};
	}

	const members: (ClassMember | StructMember | EnumVariant)[] = [];
	let underlying = "";
	let underlyingRaw = 0;
	if (kind === "class") {
		for (let index = 0; index < memberCount; index += 1) {
			const memberKind = reader.u8("a class member");
			if (memberKind === 0) {
				members.push({ kind: "list", elementType: readTypeRef(reader) });
			} else if (memberKind === 1) {
				members.push({
					kind: "dict",
					keyType: readTypeRef(reader),
					valueType: readTypeRef(reader),
				});
			} else if (memberKind === 2) {
				members.push({
					kind: "field",
					name: reader.name("a class member's name"),
					typeRef: readTypeRef(reader),
				});
			} else {
				throw new Error(
					`A class member declared an unknown kind ${memberKind}.`,
				);
			}
		}
	} else if (kind === "enum") {
		const raw = reader.u8("an enum underlying type");
		underlyingRaw = raw;
		underlying = ENUM_UNDERLYING[raw & 0x7] ?? "i32";
		for (let index = 0; index < memberCount; index += 1) {
			members.push({
				name: reader.name("an enum variant's name"),
				value: readEnumValue(reader, underlying),
			});
		}
	} else {
		for (let index = 0; index < memberCount; index += 1) {
			const name = reader.name("a struct member's name");
			members.push({ name, typeRef: readTypeRef(reader) });
		}
	}

	// The recorded size is authoritative. Seeking to it rather than trusting the
	// members that were read means an unmodelled trailing field is carried
	// through the document instead of shifting every byte after it.
	reader.seek(end);
	return {
		kind,
		rawFlags,
		guid,
		guidText: formatGuid(guid),
		localVersion,
		name: "",
		base,
		members,
		underlying,
		underlyingRaw,
	};
};

const readSchema = (bytes: Uint8Array): Schema => {
	const reader = new LeReader(bytes);
	const globalVersion = reader.u32("the schema's version");
	// Both block sizes are recorded but not used to navigate: the definitions
	// and the names follow one another, and the writer recomputes both.
	reader.u32("the schema's definition block size");
	const definitionCount = reader.u32("the schema's type count");
	reader.u32("the schema's name block size");
	if (definitionCount * 28 > bytes.length) {
		throw new Error(
			`The schema claims ${definitionCount} type definitions in ${bytes.length} bytes, which cannot be right.`,
		);
	}

	const definitions: TypeDefinition[] = [];
	for (let index = 0; index < definitionCount; index += 1) {
		definitions.push(readTypeDefinition(reader));
	}
	// The names follow the definitions in the same order, and are applied by
	// rebuilding each definition rather than by mutating one: a decoded schema
	// is a value, and a render may already have read it.
	const named = definitions.map((definition) => ({
		...definition,
		name: reader.sevenBitName("a type name"),
	}));
	const rootTypeRef = readTypeRef(reader);

	const byGuid = new Map<string, number>();
	// The first definition wins, so a GUID a schema declares twice resolves the
	// way the writer that produced it would have resolved it.
	named.forEach((definition, index) => {
		if (!byGuid.has(definition.guidText)) {
			byGuid.set(definition.guidText, index);
		}
	});
	// A name index as well, because a runtime type override in the content names
	// its type in text and the re-encoder has to find the GUID behind it.
	const byName = new Map<string, number>();
	named.forEach((definition, index) => {
		if (!byName.has(definition.name)) byName.set(definition.name, index);
	});
	return { globalVersion, definitions: named, rootTypeRef, byGuid, byName };
};

const writeSchema = (writer: LeWriter, schema: Schema): void => {
	writer.u32(schema.globalVersion);
	const sizesAt = writer.length;
	// The definition block's size, the type count, and the name block's size.
	writer.u32(0).u32(schema.definitions.length).u32(0);

	for (const definition of schema.definitions) {
		const start = writer.length;
		writer.u32(0).u32(definition.rawFlags);
		writer.u32(definition.localVersion);
		writer.raw(definition.guid);
		const base = definition.base;
		if (base) {
			const bodyStart = writer.length;
			writer.u32(base.rawFlags);
			if (base.baseTypeRef) writeTypeRef(writer, base.baseTypeRef);
			writer.raw(base.tail);
			const written = writer.length - bodyStart;
			if (written !== base.bodySize) {
				throw new Error(
					`Rebuilding the base-type block of ${definition.name} produced ${written} bytes where the file declares ${base.bodySize}.`,
				);
			}
		}
		if (definition.kind === "enum") {
			// The byte the file used, not the table index this parser reads it
			// through: the two differ in the game's files, and only the byte is
			// what the game will read back.
			writer.u8(definition.underlyingRaw);
			for (const variant of definition.members) {
				if (!("value" in variant)) {
					throw new Error(`${definition.name} is an enum with a field member.`);
				}
				writer.name(variant.name);
				writeEnumValue(writer, definition.underlying, variant.value);
			}
		} else if (definition.kind === "class") {
			for (const member of definition.members) {
				if (!("kind" in member)) {
					throw new Error(
						`${definition.name} is a class with a variant member.`,
					);
				}
				if (member.kind === "field") {
					writer.u8(2).name(member.name);
					writeTypeRef(writer, member.typeRef);
				} else if (member.kind === "list") {
					writer.u8(0);
					writeTypeRef(writer, member.elementType);
				} else {
					writer.u8(1);
					writeTypeRef(writer, member.keyType);
					writeTypeRef(writer, member.valueType);
				}
			}
		} else {
			for (const member of definition.members) {
				if (!("typeRef" in member)) {
					throw new Error(
						`${definition.name} is a struct with an enum variant member.`,
					);
				}
				writer.name(member.name);
				writeTypeRef(writer, member.typeRef);
			}
		}
		writer.patchU32(start, writer.length - start - 28);
	}
	const definitionsEnd = writer.length;

	const namesStart = writer.length;
	for (const definition of schema.definitions) {
		writer.sevenBitName(definition.name);
	}
	// Both sizes are measured from the end of the four-word header, which is
	// twelve bytes past the first of them: the definition block starts at
	// `sizesAt + 12`, not at `sizesAt + 8`.
	writer.patchU32(sizesAt, definitionsEnd - (sizesAt + 12));
	writer.patchU32(sizesAt + 8, writer.length - namesStart);

	writeTypeRef(writer, schema.rootTypeRef);
};

// ---------------------------------------------------------------------------
// Value layout
// ---------------------------------------------------------------------------

/**
 * Whether a reference is introduced by a tag byte.
 *
 * Only strings and arrays are, along with class instances (whose members make
 * them variable width) and forward references to a generic argument (which
 * might resolve to either). Structs, enums and fixed-width primitives are
 * written bare, which is what lets a struct of them be copied as one block.
 */
const needsTag = (ref: TypeRef, schema: Schema): boolean => {
	switch (ref.kind) {
		case "primitive":
			return ref.wellKnown === TYPE_STRING;
		case "array":
		case "typeArgument":
			return true;
		case "named": {
			const index = schema.byGuid.get(ref.guidText);
			if (index === undefined) return true;
			return schema.definitions[index]?.kind === "class";
		}
	}
};

const alignUp = (offset: number, align: number): number =>
	align <= 1 ? offset : Math.ceil(offset / align) * align;

/**
 * The size of a value written as a bare block, or `null` when the type is not
 * fixed width.
 *
 * The reader and the writer both ask this question and must get the same
 * answer: a struct containing a string is stored member by member, each with a
 * tag, while a struct of numbers and enums is stored as one packed block with
 * padding between the members. Asking it in one place is what keeps the two
 * directions describing the same format — and asking it *before* reading any
 * bytes is what keeps a failed layout from leaving the stream half-consumed.
 */
const blittableSize = (
	ref: TypeRef,
	schema: Schema,
	typeArgs: readonly TypeRef[] | undefined,
	depth = 0,
): number | null => {
	if (depth > 32) return null;
	if (ref.kind === "primitive") {
		const size = TYPE_SIZE[ref.wellKnown];
		return size === undefined || size === 0 ? null : size;
	}
	if (ref.kind === "array") return null;
	if (ref.kind === "typeArgument") {
		const target = typeArgs?.[ref.index];
		return target === undefined
			? null
			: blittableSize(target, schema, typeArgs, depth + 1);
	}
	const definition = definitionFor(schema, ref);
	if (definition.kind === "class") return null;
	if (definition.kind === "enum") return enumSize(definition.underlying);
	const effective = ref.typeArgs.length > 0 ? ref.typeArgs : typeArgs;
	let size = 0;
	let align = 1;
	for (const member of definition.members) {
		if (!("typeRef" in member)) return null;
		const resolved = resolveTypeArgument(member.typeRef, effective);
		const memberSize = blittableSize(resolved, schema, effective, depth + 1);
		if (memberSize === null) return null;
		// Alignment comes from the member's own type, which is a whole type
		// reference rather than a width: an eight-byte member is aligned
		// differently from a string, and only a struct can nest.
		const memberAlign = alignmentOf(resolved, schema, effective);
		size = alignUp(size, memberAlign) + memberSize;
		align = Math.max(align, memberAlign);
	}
	return alignUp(size, align);
};

/** The alignment of a fixed-width value, or 1 when it is not fixed width. */
const alignmentOf = (
	ref: TypeRef,
	schema: Schema,
	typeArgs: readonly TypeRef[] | undefined,
): number => {
	if (ref.kind === "primitive") return TYPE_ALIGN[ref.wellKnown] ?? 1;
	if (ref.kind === "typeArgument") {
		const target = typeArgs?.[ref.index];
		return target === undefined ? 1 : alignmentOf(target, schema, typeArgs);
	}
	if (ref.kind !== "named") return 1;
	const definition = definitionFor(schema, ref);
	if (definition.kind === "class") return 1;
	if (definition.kind === "enum") return enumSize(definition.underlying);
	const effective = ref.typeArgs.length > 0 ? ref.typeArgs : typeArgs;
	let align = 1;
	for (const member of definition.members) {
		if (!("typeRef" in member)) return 1;
		align = Math.max(
			align,
			alignmentOf(
				resolveTypeArgument(member.typeRef, effective),
				schema,
				effective,
			),
		);
	}
	return align;
};

// ---------------------------------------------------------------------------
// Reading the content graph
// ---------------------------------------------------------------------------

/**
 * State for one pass over a content section.
 *
 * `path` is mutated in place rather than copied per node: a realm save holds
 * millions of them, and a fresh array at every step is a fresh array per step
 * in the collector's queue. `backrefs` is the table the tags index into.
 */
type ReadContext = {
	readonly reader: LeReader;
	readonly schema: Schema;
	readonly backrefs: JsonValue[];
	/** Paths of the values the file registered, in the order it registered them. */
	readonly registered: SavePath[];
	/** Extents of the multi-dimensional arrays, which the document cannot imply. */
	readonly dimensions: (readonly [SavePath, readonly number[]])[];
	readonly path: PathSegment[];
};

const readPrimitive = (
	reader: LeReader,
	wellKnown: number,
	tagPayload: number,
): JsonValue => {
	switch (wellKnown) {
		case TYPE_BOOL:
			return reader.u8("a boolean") !== 0;
		case TYPE_SBYTE:
			return reader.i8("a signed byte");
		case TYPE_BYTE:
			return reader.u8("a byte");
		case TYPE_SHORT:
			return reader.i16("a 16-bit integer");
		case TYPE_USHORT:
		case TYPE_CHAR:
			return reader.u16("a 16-bit integer");
		case TYPE_INT:
			return reader.i32("a 32-bit integer");
		case TYPE_UINT:
			return reader.u32("a 32-bit integer");
		case TYPE_FLOAT:
			return reader.f32("a 32-bit float");
		case TYPE_DOUBLE:
			return reader.f64("a 64-bit float");
		case TYPE_FP:
			// Fixed point, with sixteen fractional bits: stored as an integer
			// and only turned into a number on the way out.
			return Number(reader.i64("a fixed-point value")) / 65536;
		case TYPE_LFP:
			return reader.i32("a fixed-point value") / 65536;
		case TYPE_STRING:
			return new TextDecoder().decode(reader.slice(tagPayload, "a string"));
		case TYPE_GUID:
			return formatGuid(reader.slice(16, "a GUID"));
		case TYPE_DECIMAL:
			return Array.from(reader.slice(16, "a decimal"))
				.map((byte) => byte.toString(16).padStart(2, "0"))
				.join("");
		case TYPE_LONG:
		case TYPE_NINT:
			// A 64-bit integer does not survive a JavaScript number, so it is
			// carried as its decimal text, which round-trips exactly.
			return reader.i64("a 64-bit integer").toString();
		case TYPE_ULONG:
		case TYPE_NUINT:
		case TYPE_ASSET_GUID:
			return reader.u64("a 64-bit integer").toString();
		default:
			throw new Error(
				`CERIMAL primitive type ${wellKnown} cannot be read by this editor.`,
			);
	}
};

/**
 * The base type a class inherits from, resolved against its generic arguments.
 *
 * Split out because the reader and the writer both walk the inheritance chain
 * and must agree on the order they visit it: base fields first, so a derived
 * field of the same name overwrites the one it hides.
 */
const baseOf = (
	definition: TypeDefinition,
	schema: Schema,
	typeArgs: readonly TypeRef[] | undefined,
): {
	readonly definition: TypeDefinition;
	readonly typeArgs: readonly TypeRef[];
} | null => {
	if (definition.kind !== "class") return null;
	const base = definition.base;
	if (!(base?.hasBase === true) || !base.baseTypeRef) return null;
	const resolved = resolveTypeArgument(base.baseTypeRef, typeArgs);
	if (resolved.kind !== "named") return null;
	const index = schema.byGuid.get(resolved.guidText);
	const parent = index === undefined ? undefined : schema.definitions[index];
	if (!parent) return null;
	return {
		definition: parent,
		typeArgs:
			resolved.typeArgs.length > 0
				? resolved.typeArgs.map((argument) =>
						resolveTypeArgument(argument, typeArgs),
					)
				: (typeArgs ?? []),
	};
};

/** Reads a record's members into `into`, base class first. */
const readRecordFields = (
	context: ReadContext,
	definition: TypeDefinition,
	typeArgs: readonly TypeRef[] | undefined,
	into: { [key: string]: JsonValue },
): void => {
	const { reader, schema } = context;
	const parent = baseOf(definition, schema, typeArgs);
	if (parent) {
		readRecordFields(context, parent.definition, parent.typeArgs, into);
	}
	if (definition.kind === "enum") return;

	for (const [index, member] of definition.members.entries()) {
		if (definition.kind === "class") {
			if (!("kind" in member)) {
				throw new Error(`${definition.name} is a class with a variant member.`);
			}
			if (member.kind === "field") {
				context.path.push(member.name);
				into[member.name] = readNode(context, member.typeRef, typeArgs);
				context.path.pop();
			} else if (member.kind === "list") {
				// A list and a dictionary have no name in the schema, only a
				// position, so the position is the key in the decoded document.
				const key = `$list${index}`;
				context.path.push(key);
				const count = reader.sevenBit("a list's length");
				const items: JsonValue[] = [];
				for (let item = 0; item < count; item += 1) {
					context.path.push(item);
					items.push(readNode(context, member.elementType, typeArgs));
					context.path.pop();
				}
				into[key] = items;
				context.path.pop();
			} else {
				const key = `$dict${index}`;
				context.path.push(key);
				const count = reader.sevenBit("a dictionary's length");
				const entries: JsonValue[] = [];
				for (let entry = 0; entry < count; entry += 1) {
					context.path.push(entry);
					const pair: { key: JsonValue; value: JsonValue } = {
						key: null,
						value: null,
					};
					context.path.push("key");
					pair.key = readNode(context, member.keyType, typeArgs);
					context.path.pop();
					context.path.push("value");
					pair.value = readNode(context, member.valueType, typeArgs);
					context.path.pop();
					entries.push(pair);
					context.path.pop();
				}
				into[key] = entries;
				context.path.pop();
			}
			continue;
		}
		if (!("typeRef" in member)) {
			throw new Error(`${definition.name} is a struct with an enum variant.`);
		}
		context.path.push(member.name);
		into[member.name] = readNode(context, member.typeRef, typeArgs);
		context.path.pop();
	}
};

const readValue = (
	context: ReadContext,
	ref: TypeRef,
	tagPayload: number,
	typeArgs: readonly TypeRef[] | undefined,
): JsonValue => {
	const { reader, schema } = context;
	if (ref.kind === "primitive") {
		return readPrimitive(reader, ref.wellKnown, tagPayload);
	}
	if (ref.kind === "typeArgument") {
		const target = typeArgs?.[ref.index];
		if (!target) {
			throw new Error("The schema uses a generic argument it never supplied.");
		}
		return readValue(context, target, tagPayload, typeArgs);
	}
	if (ref.kind === "array") {
		// Only the first extent rides in the tag; the rest follow as 7-bit
		// integers, and the elements are stored flattened.
		const dimensions: number[] = [tagPayload];
		for (let rank = 1; rank < ref.rank; rank += 1) {
			dimensions.push(reader.sevenBit("an array's extent"));
		}
		if (ref.rank > 1) {
			context.dimensions.push([[...context.path], dimensions]);
		}
		const total = dimensions.reduce((product, extent) => product * extent, 1);
		const items: JsonValue[] = [];
		for (let index = 0; index < total; index += 1) {
			context.path.push(index);
			items.push(readNode(context, ref.element, typeArgs));
			context.path.pop();
		}
		return items;
	}

	const definition = definitionFor(schema, ref);
	const effective = ref.typeArgs.length > 0 ? ref.typeArgs : typeArgs;
	if (definition.kind === "enum") {
		const value = readEnumValue(reader, definition.underlying);
		const variant = definition.members.find(
			(candidate) => "value" in candidate && candidate.value === value,
		);
		return variant && "name" in variant ? variant.name : value.toString();
	}
	const into: { [key: string]: JsonValue } = {};
	if (definition.kind !== "class") {
		// A struct of fixed-width members is one packed block, padding and all,
		// with each member read from its own place inside it. The size is asked
		// for before a byte is taken, so a struct that is not fixed width costs
		// nothing and leaves the stream where it was.
		const size = blittableSize(ref, schema, effective);
		if (size !== null) {
			const block: ReadContext = {
				...context,
				reader: new LeReader(reader.slice(size, `a ${definition.name} value`)),
			};
			let offset = 0;
			for (const member of definition.members) {
				if (!("typeRef" in member)) {
					throw new Error(
						`${definition.name} has a variant where a field belongs.`,
					);
				}
				const resolved = resolveTypeArgument(member.typeRef, effective);
				const memberSize = blittableSize(resolved, schema, effective);
				if (memberSize === null) {
					throw new Error(
						`${definition.name}.${member.name} has no fixed width.`,
					);
				}
				offset = alignUp(offset, alignmentOf(resolved, schema, effective));
				block.reader.seek(offset);
				into[member.name] = readValue(block, resolved, 0, effective);
				offset += memberSize;
			}
			return into;
		}
	}
	readRecordFields(context, definition, effective, into);
	return into;
};

const readNode = (
	context: ReadContext,
	ref: TypeRef,
	typeArgs: readonly TypeRef[] | undefined,
): JsonValue => {
	const { reader, schema } = context;
	const resolved = resolveTypeArgument(ref, typeArgs);
	if (!needsTag(resolved, schema)) {
		return readValue(context, resolved, 0, typeArgs);
	}
	const tag = reader.sevenBit("a value tag");
	const kind = tag & 0x3;
	if (kind === 0) return null;
	if (kind === 1) {
		const slot = tag >> 2;
		const value = context.backrefs[slot];
		if (value === undefined) {
			throw new Error(
				`The content stream refers back to value ${slot}, which it never wrote.`,
			);
		}
		return value;
	}
	if (kind === 2) {
		const value = readValue(context, resolved, tag >> 3, typeArgs);
		// Bit 2 of the tag says the value joins the back-reference table, and it
		// joins *after* being read — so a value nested inside it is registered
		// first and takes the lower slot.
		if (((tag >> 2) & 1) !== 0) {
			context.registered.push([...context.path]);
			context.backrefs.push(value);
		}
		return value;
	}
	const runtimeType = readTypeRef(reader);
	return {
		$type: formatTypeRef(runtimeType, schema),
		$value: readNode(context, runtimeType, typeArgs),
	};
};

// ---------------------------------------------------------------------------
// Writing the content graph
// ---------------------------------------------------------------------------

/** State for one pass over a content section being rebuilt. */
type WriteContext = {
	readonly writer: LeWriter;
	readonly schema: Schema;
	/** Values already in the back-reference table, keyed by object identity. */
	readonly backrefs: Map<JsonValue, number>;
	/** The paths whose values the file registered, as a set of path keys. */
	readonly registered: ReadonlySet<string>;
	readonly dimensions: ReadonlyMap<string, readonly number[]>;
	readonly path: PathSegment[];
	/** The next slot to hand out; the file's table is filled in write order. */
	nextSlot: number;
};

const pathKey = (path: readonly PathSegment[]): string => JSON.stringify(path);

const asNumber = (value: JsonValue, what: string): number => {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	throw new Error(
		`This field wants a number for ${what}, not ${typeof value}.`,
	);
};

const asBigInt = (value: JsonValue, what: string): bigint => {
	if (typeof value === "number" && Number.isInteger(value)) {
		return BigInt(value);
	}
	if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value);
	throw new Error(`This field wants a whole 64-bit number for ${what}.`);
};

const asText = (value: JsonValue, what: string): string => {
	if (typeof value === "string") return value;
	throw new Error(`This field wants text for ${what}, not ${typeof value}.`);
};

const asBoolean = (value: JsonValue, what: string): boolean => {
	if (typeof value === "boolean") return value;
	throw new Error(`This field wants true or false for ${what}.`);
};

const asHexBytes = (value: JsonValue, what: string): Uint8Array => {
	const text = asText(value, what);
	if (text.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(text)) {
		throw new Error(`This field wants ${what} as pairs of hex digits.`);
	}
	const bytes = new Uint8Array(text.length / 2);
	for (let index = 0; index < bytes.length; index += 1) {
		bytes[index] = Number.parseInt(text.slice(index * 2, index * 2 + 2), 16);
	}
	return bytes;
};

const writePrimitive = (
	writer: LeWriter,
	wellKnown: number,
	value: JsonValue,
): void => {
	switch (wellKnown) {
		case TYPE_BOOL:
			writer.u8(asBoolean(value, "BOOL") ? 1 : 0);
			return;
		case TYPE_SBYTE:
			writer.i8(asNumber(value, "SBYTE"));
			return;
		case TYPE_BYTE:
			writer.u8(asNumber(value, "BYTE"));
			return;
		case TYPE_SHORT:
			writer.i16(asNumber(value, "SHORT"));
			return;
		case TYPE_USHORT:
		case TYPE_CHAR:
			writer.u16(asNumber(value, "USHORT"));
			return;
		case TYPE_INT:
			writer.i32(asNumber(value, "INT"));
			return;
		case TYPE_UINT:
			writer.u32(asNumber(value, "UINT"));
			return;
		case TYPE_FLOAT:
			writer.f32(asNumber(value, "FLOAT"));
			return;
		case TYPE_DOUBLE:
			writer.f64(asNumber(value, "DOUBLE"));
			return;
		case TYPE_FP:
			// `Math.round` because the stored value is an integer number of
			// 1/65536ths, and the document holds a float that may have lost the
			// last bit of it on the way through JSON. Rounding is what makes a
			// value that was read and written back unchanged come out identical.
			writer.i64(BigInt(Math.round(asNumber(value, "FP") * 65536)));
			return;
		case TYPE_LFP:
			writer.i32(Math.round(asNumber(value, "LFP") * 65536));
			return;
		case TYPE_STRING:
			writer.raw(new TextEncoder().encode(asText(value, "STRING")));
			return;
		case TYPE_GUID:
			writer.raw(parseGuid(asText(value, "GUID")));
			return;
		case TYPE_DECIMAL:
			writer.raw(asHexBytes(value, "DECIMAL"));
			return;
		case TYPE_LONG:
		case TYPE_NINT:
			writer.i64(asBigInt(value, "LONG"));
			return;
		case TYPE_ULONG:
		case TYPE_NUINT:
		case TYPE_ASSET_GUID:
			writer.u64(asBigInt(value, "ULONG"));
			return;
		default:
			throw new Error(
				`CERIMAL primitive type ${wellKnown} cannot be written by this editor.`,
			);
	}
};

const writeRecordFields = (
	context: WriteContext,
	definition: TypeDefinition,
	typeArgs: readonly TypeRef[] | undefined,
	value: { readonly [key: string]: JsonValue },
): void => {
	const { writer, schema } = context;
	const parent = baseOf(definition, schema, typeArgs);
	if (parent) {
		writeRecordFields(context, parent.definition, parent.typeArgs, value);
	}
	if (definition.kind === "enum") return;

	const field = (name: string): JsonValue => {
		const found = value[name];
		if (found === undefined) {
			throw new Error(`${definition.name} has no field called ${name}.`);
		}
		return found;
	};

	for (const [index, member] of definition.members.entries()) {
		if (definition.kind === "class") {
			if (!("kind" in member)) {
				throw new Error(`${definition.name} is a class with a variant member.`);
			}
			if (member.kind === "field") {
				context.path.push(member.name);
				writeNode(context, member.typeRef, field(member.name), typeArgs);
				context.path.pop();
			} else if (member.kind === "list") {
				const key = `$list${index}`;
				const items = value[key];
				if (!Array.isArray(items)) {
					throw new Error(`${definition.name} has no list at ${key}.`);
				}
				context.path.push(key);
				writer.sevenBit(items.length);
				for (const [item, entry] of items.entries()) {
					context.path.push(item);
					writeNode(context, member.elementType, entry, typeArgs);
					context.path.pop();
				}
				context.path.pop();
			} else {
				const key = `$dict${index}`;
				const entries = value[key];
				if (!Array.isArray(entries)) {
					throw new Error(`${definition.name} has no dictionary at ${key}.`);
				}
				context.path.push(key);
				writer.sevenBit(entries.length);
				for (const [entryIndex, pair] of entries.entries()) {
					if (!isJsonObject(pair)) {
						throw new Error(`An entry of ${key} is not a key and a value.`);
					}
					context.path.push(entryIndex);
					context.path.push("key");
					writeNode(context, member.keyType, pair.key ?? null, typeArgs);
					context.path.pop();
					context.path.push("value");
					writeNode(context, member.valueType, pair.value ?? null, typeArgs);
					context.path.pop();
					context.path.pop();
				}
				context.path.pop();
			}
			continue;
		}
		if (!("typeRef" in member)) {
			throw new Error(`${definition.name} is a struct with an enum variant.`);
		}
		context.path.push(member.name);
		writeNode(context, member.typeRef, field(member.name), typeArgs);
		context.path.pop();
	}
};

/**
 * The extents to write an array with.
 *
 * Only the first is recoverable from a flattened document. A rank of one needs
 * nothing; anything higher was recorded when the save was read, because
 * `[2,3,4]` and `[24,1,1]` hold the same twenty-four elements and only the
 * file knows which it meant.
 */
const arrayExtents = (
	context: WriteContext,
	rank: number,
	length: number,
): readonly number[] => {
	if (rank <= 1) return [length];
	const recorded = context.dimensions.get(pathKey(context.path));
	if (!recorded) {
		throw new Error(
			"This save holds a multi-dimensional array, and this document does not record its shape.",
		);
	}
	return recorded;
};

/**
 * Writes a value that is already known not to be introduced by a tag.
 *
 * There is no payload parameter, unlike the reader's: the payload a tag carries
 * is a length or an extent, and both are implied by what gets written — a
 * string writes its own bytes and an array its own elements — so it is computed
 * once, in `tagPayloadFor`, and never needed again.
 */
const writeValue = (
	context: WriteContext,
	ref: TypeRef,
	value: JsonValue,
	typeArgs: readonly TypeRef[] | undefined,
): void => {
	const { writer, schema } = context;
	if (ref.kind === "primitive") {
		writePrimitive(writer, ref.wellKnown, value);
		return;
	}
	if (ref.kind === "typeArgument") {
		const target = typeArgs?.[ref.index];
		if (!target) {
			throw new Error("The schema uses a generic argument it never supplied.");
		}
		writeValue(context, target, value, typeArgs);
		return;
	}
	if (ref.kind === "array") {
		if (!Array.isArray(value)) {
			throw new Error(
				`${formatTypeRef(ref, schema)} is an array, and this value is not one.`,
			);
		}
		const extents = arrayExtents(context, ref.rank, value.length);
		for (let rank = 1; rank < extents.length; rank += 1) {
			writer.sevenBit(extents[rank] ?? 0);
		}
		for (const [index, item] of value.entries()) {
			context.path.push(index);
			writeNode(context, ref.element, item, typeArgs);
			context.path.pop();
		}
		return;
	}

	const definition = definitionFor(schema, ref);
	const effective = ref.typeArgs.length > 0 ? ref.typeArgs : typeArgs;
	if (definition.kind === "enum") {
		const variant =
			typeof value === "string"
				? definition.members.find(
						(candidate) => "name" in candidate && candidate.name === value,
					)
				: undefined;
		writeEnumValue(
			writer,
			definition.underlying,
			variant && "value" in variant
				? variant.value
				: asBigInt(value, definition.name),
		);
		return;
	}
	if (definition.kind !== "class") {
		// The same question the reader asked, so the two agree on which of the
		// two forms a struct is stored in. Padding goes out as zeroes: the real
		// saves do contain structs that need it — `System.Nullable<T>` fills
		// nine of its sixteen bytes — and all eleven of them come back
		// byte-identical, so the game's own writer leaves that padding zero.
		const size = blittableSize(ref, schema, effective);
		if (size !== null) {
			const object = isJsonObject(value) ? value : {};
			const block = new LeWriter(size);
			const blockContext: WriteContext = { ...context, writer: block };
			let offset = 0;
			for (const member of definition.members) {
				if (!("typeRef" in member)) {
					throw new Error(
						`${definition.name} has a variant where a field belongs.`,
					);
				}
				const resolved = resolveTypeArgument(member.typeRef, effective);
				const memberSize = blittableSize(resolved, schema, effective);
				if (memberSize === null) {
					throw new Error(
						`${definition.name}.${member.name} has no fixed width.`,
					);
				}
				const memberOffset = alignUp(
					offset,
					alignmentOf(resolved, schema, effective),
				);
				while (block.length < memberOffset) block.u8(0);
				const field = object[member.name] ?? null;
				writeValue(blockContext, resolved, field, effective);
				offset = memberOffset + memberSize;
			}
			while (block.length < size) block.u8(0);
			writer.raw(block.finish());
			return;
		}
	}
	writeRecordFields(
		context,
		definition,
		effective,
		isJsonObject(value) ? value : {},
	);
};

/** The tag payload for a tagged value: a string's length, an array's first extent. */
const tagPayloadFor = (
	context: WriteContext,
	ref: TypeRef,
	value: JsonValue,
): number => {
	if (ref.kind === "primitive" && ref.wellKnown === TYPE_STRING) {
		return new TextEncoder().encode(asText(value, "STRING")).length;
	}
	if (ref.kind === "array" && Array.isArray(value)) {
		return arrayExtents(context, ref.rank, value.length)[0] ?? 0;
	}
	// A class instance, or a forward reference that resolved to one of the two
	// above, carries no length: the payload is unused and written as zero.
	return 0;
};

const writeNode = (
	context: WriteContext,
	ref: TypeRef,
	value: JsonValue,
	typeArgs: readonly TypeRef[] | undefined,
): void => {
	const { writer, schema } = context;
	const resolved = resolveTypeArgument(ref, typeArgs);
	if (!needsTag(resolved, schema)) {
		writeValue(context, resolved, value, typeArgs);
		return;
	}
	if (value === null) {
		writer.sevenBit(0);
		return;
	}
	// A value the file already wrote is written again as a reference to it.
	//
	// The lookup is the game's own rule, not a heuristic: its writer keeps a
	// table of everything it has written and consults it before every value, so
	// walking the document in the same order reaches the same decisions. For an
	// object the table is keyed by reference, and the reader hands back the very
	// same instance for a back-reference, so identity in the document is the
	// record. For a primitive it is keyed by value, and the biggest real save
	// leans on that: 16 371 of its back-references are strings, every one of them
	// a Steam ID or a name written once and referred to everywhere after. A table
	// of paths would be a megabyte of side data to say what the map already says.
	const slot = context.backrefs.get(value);
	if (slot !== undefined) {
		writer.sevenBit(1 | (slot << 2));
		return;
	}
	// A runtime type override: the tag says which type the value really is,
	// rather than the one its field declared, and the type follows the tag. The
	// reader turns it into a `$type`/`$value` pair, and this puts it back.
	if (
		isJsonObject(value) &&
		typeof value.$type === "string" &&
		"$value" in value
	) {
		const runtimeType = parseTypeRefText(value.$type, schema);
		writer.sevenBit(3);
		writeTypeRef(writer, runtimeType);
		writeNode(context, runtimeType, value.$value, typeArgs);
		return;
	}
	const register = context.registered.has(pathKey(context.path));
	const payload = tagPayloadFor(context, resolved, value);
	writer.sevenBit(2 | (register ? 4 : 0) | (payload << 3));
	writeValue(context, resolved, value, typeArgs);
	if (register) {
		// Registered after the value is written, so anything nested inside it
		// already holds the lower slot — the order the reader sees.
		context.backrefs.set(value, context.nextSlot);
		context.nextSlot += 1;
	}
};

// ---------------------------------------------------------------------------
// One document
// ---------------------------------------------------------------------------

/**
 * Reads one document, checksum and all.
 *
 * The checksum covers the schema and the content as one contiguous run, which
 * is how they sit in the file, so it is hashed in place rather than over a
 * copy. It is checked *before* the content is walked: a damaged file should be
 * refused in a millisecond rather than turned into a plausible tree first.
 */
const readDocument = (
	reader: LeReader,
	stream: Uint8Array,
): DecodedDocument => {
	const version = reader.u8("a document's version");
	if (version !== 2 && version !== 3) {
		throw new Error(
			`This CERIMAL document declares version ${version}; this editor reads versions 2 and 3.`,
		);
	}
	const schemaSize = reader.u32("a document's schema size");
	const contentSize = reader.u32("a document's content size");
	const compression = version <= 2 ? 0 : reader.u32("a document's compression");
	if (compression !== 0) {
		throw new Error(
			"This document is compressed with Zstandard, which a browser cannot read without the game's dictionary.",
		);
	}
	const checksum = reader.u64("a document's checksum");
	const bodyStart = reader.position;
	const schemaBytes = reader.slice(schemaSize, "a document's schema");
	const bodyEnd = reader.position + contentSize;
	const actual = xxHash64(stream.subarray(bodyStart, bodyEnd));
	if (actual !== checksum) {
		throw new Error(
			`This document is damaged: it declares the checksum ${hex64(
				checksum,
			)} and its schema and content hash to ${hex64(actual)}.`,
		);
	}
	reader.seek(bodyEnd);

	const schema = readSchema(schemaBytes);
	const content = new LeReader(stream.subarray(bodyEnd - contentSize, bodyEnd));
	const context: ReadContext = {
		reader: content,
		schema,
		backrefs: [],
		registered: [],
		dimensions: [],
		path: [],
	};
	// The content opens with the size of its back-reference table and the slot
	// each registration will occupy. The slots are counted, not listed, by the
	// writer this format ships with: they run 0, 1, 2 … in the order the
	// registrations are written.
	const slotCount = content.sevenBit("the back-reference table's size");
	for (let slot = 0; slot < slotCount; slot += 1) {
		const declared = content.sevenBit("a back-reference slot");
		if (declared !== slot) {
			throw new Error(
				`This document numbers its shared values ${declared} where ${slot} was expected, so this editor cannot rebuild it byte for byte.`,
			);
		}
	}
	const data = readNode(context, schema.rootTypeRef, undefined);
	if (content.remaining !== 0) {
		throw new Error(
			`This document's content has ${content.remaining} unread byte(s) after its data, so it is not what its schema describes.`,
		);
	}
	if (context.registered.length !== slotCount) {
		throw new Error(
			`This document declares ${slotCount} shared values and registers ${context.registered.length}, so this editor cannot rebuild it byte for byte.`,
		);
	}
	return {
		header: { version, compression, checksum, schemaSize, contentSize },
		rootType: formatTypeRef(schema.rootTypeRef, schema),
		data,
		registered: context.registered,
		dimensions: context.dimensions,
		schema,
		schemaBytes,
	};
};

/** Writes one document, checksum included, into `out` at its current position. */
const writeDocument = (out: LeWriter, view: CerimalDocumentView): void => {
	const schema = readSchema(base64Decode(view.schema));
	const registered = view.registered.map(pathKey);
	const context: WriteContext = {
		writer: out,
		schema,
		backrefs: new Map<JsonValue, number>(),
		registered: new Set(registered),
		dimensions: new Map(
			view.dimensions.map(([path, extents]) => [pathKey(path), extents]),
		),
		path: [],
		nextSlot: 0,
	};

	out.raw(new TextEncoder().encode(MAGIC));
	out.u8(view.version);
	const schemaSizeAt = out.length;
	out.u32(0);
	const contentSizeAt = out.length;
	out.u32(0);
	if (view.version > 2) out.u32(view.compression);
	const checksumAt = out.length;
	out.u64(0n);

	const bodyStart = out.length;
	writeSchema(out, schema);
	const contentStart = out.length;
	out.sevenBit(registered.length);
	for (let slot = 0; slot < registered.length; slot += 1) out.sevenBit(slot);
	writeNode(context, schema.rootTypeRef, view.data, undefined);
	const bodyEnd = out.length;

	out.patchU32(schemaSizeAt, contentStart - bodyStart);
	out.patchU32(contentSizeAt, bodyEnd - contentStart);
	out.patchU64(checksumAt, xxHash64(out.writtenFrom(bodyStart)));
};

// ---------------------------------------------------------------------------
// The saved file
// ---------------------------------------------------------------------------

/**
 * Yields to the browser between phases of a decode or a rebuild.
 *
 * A macrotask rather than a microtask on purpose: a microtask would be drained
 * before the next paint, so the progress the workbench is showing would never
 * appear. This is the same trade the Crimson Desert editor made in ADR-0003.
 */
const yieldToBrowser = (): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, 0);
	});

/**
 * Splits the file text around the base64 payload.
 *
 * Both halves are kept exactly as they were written, because the envelope is
 * re-spliced rather than re-serialised: `"createdAtEpoch":1748808327.0` comes
 * back from `JSON.stringify` as `1748808327`, and the game's own key order is
 * not one `JSON.stringify` would necessarily reproduce.
 */
const splitWrapper = (text: string): { before: string; after: string } => {
	const start = text.indexOf(PAYLOAD_KEY);
	if (start < 0) return { before: text, after: "" };
	const from = start + PAYLOAD_KEY.length;
	// A base64 payload contains no quote and no backslash, so the next quote
	// that ends it is the closing one.
	const end = text.indexOf('"', from);
	if (end < 0) {
		throw new Error("This save's binaryInfo field is not terminated.");
	}
	return { before: text.slice(0, from), after: text.slice(end) };
};

/** The `unknown` a `JSON.parse` hands back, narrowed to a document. */
const toJsonValue = (value: unknown, depth = 0): JsonValue => {
	if (depth > 256) {
		throw new Error("This save nests its JSON too deeply to read.");
	}
	if (value === null) return null;
	switch (typeof value) {
		case "string":
		case "boolean":
			return value;
		case "number":
			if (!Number.isFinite(value)) {
				throw new Error("This save holds a number JSON cannot represent.");
			}
			return value;
		case "object":
			break;
		default:
			throw new Error(
				`This save holds a ${typeof value}, which JSON does not have.`,
			);
	}
	if (Array.isArray(value)) {
		return value.map((item) => toJsonValue(item, depth + 1));
	}
	// `Object.entries` is typed over `{ [key: string]: T }`, which the parser's
	// own return type is not; the entries are re-validated one by one below, so
	// nothing reaches the document unchecked.
	const entries = Object.entries(value);
	return Object.fromEntries(
		entries.map(([key, item]: [string, unknown]) => [
			key,
			toJsonValue(item, depth + 1),
		]),
	);
};

/**
 * Whether a value read out of a document is an object.
 *
 * The shared `isJsonObject` takes a `JsonValue`, and a value taken from a
 * document is `JsonValue | undefined` under this project's index-signature
 * rules — absence is an ordinary outcome when a save turns out not to be one of
 * ours, so it is answered here rather than with a non-null assertion.
 */
const isRecord = (
	value: JsonValue | undefined,
): value is { readonly [key: string]: JsonValue } =>
	value !== undefined && isJsonObject(value);

const asObject = (
	value: JsonValue | undefined,
	what: string,
): { [key: string]: JsonValue } => {
	if (!isRecord(value)) {
		throw new Error(`This save has no ${what}.`);
	}
	return value;
};

const asText_ = (value: JsonValue | undefined, what: string): string => {
	if (typeof value === "string") return value;
	throw new Error(`This save has no ${what}.`);
};

const asPathList = (
	value: JsonValue | undefined,
	what: string,
): readonly SavePath[] => {
	if (value === undefined) return [];
	if (!Array.isArray(value)) {
		throw new Error(`This document's ${what} is not a list of paths.`);
	}
	return value.map((entry) => {
		if (!Array.isArray(entry)) {
			throw new Error(
				`This document's ${what} holds something that is not a path.`,
			);
		}
		return entry.map((segment) => {
			if (typeof segment === "string" || typeof segment === "number") {
				return segment;
			}
			throw new Error(
				`A path in this document's ${what} has an unusable step.`,
			);
		});
	});
};

const asDimensionList = (
	value: JsonValue | undefined,
): readonly (readonly [SavePath, readonly number[]])[] => {
	if (value === undefined) return [];
	if (!Array.isArray(value)) {
		throw new Error("This document's array shapes are not a list.");
	}
	return value.map((entry) => {
		const pair = asObject(entry, "array shape");
		const path = asPathList(pair.path, "array shapes");
		const extents = pair.extents;
		if (!Array.isArray(extents) || !path[0]) {
			throw new Error("This document holds an array shape without a path.");
		}
		return [
			path[0],
			extents.map((extent) => asNumber(extent, "an array extent")),
		];
	});
};

/** Checks that a value really is one of this codec's documents, field by field. */
const asCerimalFile = (value: JsonValue): CerimalFile => {
	const root = asObject(value, "CERIMAL section");
	const section = asObject(root.$cerimal, "CERIMAL section");
	const documents: CerimalDocumentView[] = [];
	const views = section.documents;
	if (views !== undefined && !Array.isArray(views)) {
		throw new Error("This document's CERIMAL documents are not a list.");
	}
	for (const entry of views ?? []) {
		const view = asObject(entry, "CERIMAL document");
		const data = view.data;
		if (data === undefined) {
			throw new Error("A CERIMAL document in this file has no data.");
		}
		documents.push({
			rootType: asText_(view.rootType, "document type name"),
			version: asNumber(view.version ?? 2, "document version"),
			compression: asNumber(view.compression ?? 0, "document compression"),
			schema: asText_(view.schema, "document schema"),
			registered: asPathList(view.registered, "shared values"),
			dimensions: asDimensionList(view.dimensions),
			data,
		});
	}
	return {
		$cerimal: {
			envelope: asObject(section.envelope, "save envelope"),
			wrapperBefore: asText_(section.wrapperBefore, "save wrapper"),
			wrapperAfter: asText_(section.wrapperAfter, "save wrapper"),
			documents,
		},
	};
};

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
		const reader = new LeReader(stream);
		while (reader.remaining > MAGIC.length) {
			const magic = new TextDecoder().decode(
				reader.slice(MAGIC.length, "a document's magic"),
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

	const stream = new LeWriter(1 << 16);
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

/**
 * Whether the envelope is still the one the wrapper text was written around.
 *
 * True means the payload can be spliced back and the file returns byte for
 * byte. False means an envelope field has been edited.
 */
const wrapperMatches = (
	before: string,
	after: string,
	envelope: { readonly [key: string]: JsonValue },
): boolean => {
	try {
		// `wrapperBefore` ends with the opening quote of the payload and
		// `wrapperAfter` begins with its closing one, so putting the two together
		// leaves an empty string between the quotes — the only way to read back
		// what the wrapper originally wrapped.
		const rebuilt = toJsonValue(JSON.parse(`${before}${after}`));
		if (!isJsonObject(rebuilt)) return false;
		const without = { ...rebuilt };
		delete without.binaryInfo;
		return JSON.stringify(without) === JSON.stringify(envelope);
	} catch {
		return false;
	}
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

/** Whether a payload-less save's text is still the envelope it was read from. */
const plainMatches = (
	before: string,
	envelope: { readonly [key: string]: JsonValue },
): boolean => {
	try {
		return (
			JSON.stringify(toJsonValue(JSON.parse(before))) ===
			JSON.stringify(envelope)
		);
	} catch {
		return false;
	}
};

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
