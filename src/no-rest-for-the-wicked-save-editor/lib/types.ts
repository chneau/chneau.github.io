import type { JsonValue, SavePath } from "../../shared";

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

export const TYPE_SIZE: readonly number[] = [
	1, 1, 1, 2, 2, 4, 4, 8, 8, 8, 8, 2, 8, 4, 16, 16, 0, 8, 8, 4,
];

export const TYPE_ALIGN: readonly number[] = [
	1, 1, 1, 2, 2, 4, 4, 8, 8, 8, 8, 2, 8, 4, 4, 4, 0, 8, 8, 4,
];

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

export const DEFINITION_KINDS = [
	"class",
	"struct",
	"unmanaged",
	"enum",
] as const;

type DefinitionKind = (typeof DEFINITION_KINDS)[number];

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

export type ClassMember =
	| { readonly kind: "field"; readonly name: string; readonly typeRef: TypeRef }
	| { readonly kind: "list"; readonly elementType: TypeRef }
	| {
			readonly kind: "dict";
			readonly keyType: TypeRef;
			readonly valueType: TypeRef;
	  };

export type StructMember = {
	readonly name: string;
	readonly typeRef: TypeRef;
};

export type EnumVariant = {
	readonly name: string;
	readonly value: number | bigint;
};

export type BaseBlock = {
	readonly rawFlags: number;
	readonly bodySize: number;
	readonly hasBase: boolean;
	readonly interfaceCount: number;
	readonly baseTypeRef: TypeRef | null;
	readonly tail: Uint8Array;
};

export type TypeDefinition = {
	readonly kind: DefinitionKind;
	readonly rawFlags: number;
	readonly guid: Uint8Array;
	readonly guidText: string;
	readonly localVersion: number;
	readonly name: string;
	readonly base: BaseBlock | null;
	readonly members: readonly (ClassMember | StructMember | EnumVariant)[];
	readonly underlying: string;
	readonly underlyingRaw: number;
};

export type Schema = {
	readonly globalVersion: number;
	readonly definitions: readonly TypeDefinition[];
	readonly rootTypeRef: TypeRef;
	readonly byGuid: ReadonlyMap<string, number>;
	readonly byName: ReadonlyMap<string, number>;
};

type DocumentHeader = {
	readonly version: number;
	readonly compression: number;
	readonly checksum: bigint;
	readonly schemaSize: number;
	readonly contentSize: number;
};

export type DecodedDocument = {
	readonly header: DocumentHeader;
	readonly rootType: string;
	readonly data: JsonValue;
	readonly registered: readonly SavePath[];
	readonly dimensions: readonly (readonly [SavePath, readonly number[]])[];
	readonly schema: Schema;
	readonly schemaBytes: Uint8Array;
};

export type CerimalDocumentView = {
	readonly rootType: string;
	readonly version: number;
	readonly compression: number;
	readonly schema: string;
	readonly registered: readonly SavePath[];
	readonly dimensions: readonly (readonly [SavePath, readonly number[]])[];
	readonly data: JsonValue;
};

export type CerimalFile = {
	readonly $cerimal: {
		readonly envelope: { readonly [key: string]: JsonValue };
		readonly wrapperBefore: string;
		readonly wrapperAfter: string;
		readonly documents: readonly CerimalDocumentView[];
	};
};
