/**
 * The CERIMAL model: the primitive vocabulary a schema is written in, the type
 * graph it declares, and the documents a save decodes to.
 *
 * These declarations are shared by the schema parser, the node reader and
 * writer, and the codec, so they live in one module that imports none of the
 * others. Split out of `format.ts` unchanged.
 */
import type { JsonValue, SavePath } from "../../shared";

/**
 * The well-known type ids CERIMAL gives primitives, in the order the schema
 * stores them. These are the format's own vocabulary — the names a
 * `Quantum.*` field's type prints as — so they are spelled as the game spells
 * them rather than renamed.
 */
export const TYPE_BOOL = 0;
export const TYPE_SBYTE = 1;
export const TYPE_BYTE = 2;
export const TYPE_SHORT = 3;
export const TYPE_USHORT = 4;
export const TYPE_INT = 5;
export const TYPE_UINT = 6;
export const TYPE_LONG = 7;
export const TYPE_ULONG = 8;
export const TYPE_NINT = 9;
export const TYPE_NUINT = 10;
export const TYPE_CHAR = 11;
export const TYPE_DOUBLE = 12;
export const TYPE_FLOAT = 13;
export const TYPE_DECIMAL = 14;
export const TYPE_GUID = 15;
export const TYPE_STRING = 16;
export const TYPE_FP = 17;
export const TYPE_ASSET_GUID = 18;
export const TYPE_LFP = 19;

/** Display names, indexed by the ids above. */
export const TYPE_NAMES: readonly string[] = [
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
export const TYPE_SIZE: readonly number[] = [
	1, 1, 1, 2, 2, 4, 4, 8, 8, 8, 8, 2, 8, 4, 16, 16, 0, 8, 8, 4,
];

/** Alignment in bytes, indexed by the ids above. */
export const TYPE_ALIGN: readonly number[] = [
	1, 1, 1, 2, 2, 4, 4, 8, 8, 8, 8, 2, 8, 4, 4, 4, 0, 8, 8, 4,
];

/** The integer widths an enum's underlying type can take, in stored order. */
export const ENUM_UNDERLYING: readonly string[] = [
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
export const DEFINITION_KINDS = [
	"class",
	"struct",
	"unmanaged",
	"enum",
] as const;

type DefinitionKind = (typeof DEFINITION_KINDS)[number];

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
export type TypeRef =
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
export type ClassMember =
	| { readonly kind: "field"; readonly name: string; readonly typeRef: TypeRef }
	| { readonly kind: "list"; readonly elementType: TypeRef }
	| {
			readonly kind: "dict";
			readonly keyType: TypeRef;
			readonly valueType: TypeRef;
	  };

/** A field declared by a struct or an unmanaged type. */
export type StructMember = {
	readonly name: string;
	readonly typeRef: TypeRef;
};

export type EnumVariant = {
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
export type BaseBlock = {
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
export type TypeDefinition = {
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
export type Schema = {
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
export type DecodedDocument = {
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
export type CerimalDocumentView = {
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
