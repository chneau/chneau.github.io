/**
 * The CERIMAL schema parser: reads back the type graph a document carries and
 * writes it out from the same numbers, so a rebuilt save's schema is
 * byte-identical to the one that was read.
 *
 * Split out of `format.ts` unchanged.
 */
import { CerimalReader, type CerimalWriter, formatGuid } from "./byte-reader";
import {
	type BaseBlock,
	type ClassMember,
	DEFINITION_KINDS,
	ENUM_UNDERLYING,
	type EnumVariant,
	type Schema,
	type StructMember,
	TYPE_NAMES,
	type TypeDefinition,
	type TypeRef,
} from "./types";

/** Resolves a forward reference to one of a named type's generic arguments. */
export const resolveTypeArgument = (
	ref: TypeRef,
	typeArgs: readonly TypeRef[] | undefined,
): TypeRef => {
	if (ref.kind !== "typeArgument") return ref;
	return typeArgs?.[ref.index] ?? ref;
};

/** Renders a type reference the way a schema prints it, for display. */
export const formatTypeRef = (ref: TypeRef, schema: Schema): string => {
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
export const parseTypeRefText = (
	text: string,
	schema: Schema,
	depth = 0,
): TypeRef => {
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

export const definitionFor = (schema: Schema, ref: TypeRef): TypeDefinition => {
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

export const readTypeRef = (reader: CerimalReader): TypeRef => {
	const header = reader.u8("a type reference");
	const kind = header & 0x3;
	if (kind === 0) return { kind: "primitive", wellKnown: header >> 3 };
	if (kind === 1) {
		return { kind: "array", rank: header >> 3, element: readTypeRef(reader) };
	}
	if (kind === 2) return { kind: "typeArgument", index: header >> 3 };
	const guid = reader.borrow(16, "a type GUID");
	const typeArgs: TypeRef[] = [];
	for (let index = 0; index < header >> 3; index += 1) {
		typeArgs.push(readTypeRef(reader));
	}
	return { kind: "named", guid, guidText: formatGuid(guid), typeArgs };
};

export const writeTypeRef = (writer: CerimalWriter, ref: TypeRef): void => {
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

export const readEnumValue = (
	reader: CerimalReader,
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

export const writeEnumValue = (
	writer: CerimalWriter,
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
export const enumSize = (underlying: string): number => {
	if (underlying === "u8" || underlying === "i8") return 1;
	if (underlying === "u16" || underlying === "i16") return 2;
	if (underlying === "u64" || underlying === "i64") return 8;
	return 4;
};

const readTypeDefinition = (reader: CerimalReader): TypeDefinition => {
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
	const guid = reader.borrow(16, "a type GUID");

	let base: BaseBlock | null = null;
	if (hasBase) {
		const rawBaseFlags = reader.u32("a base-type block");
		const declaredSize = rawBaseFlags & 0x00ffffff;
		const body = reader.borrow(
			Math.max(0, declaredSize - 4),
			"a base-type block",
		);
		const bodyReader = new CerimalReader(body);
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

export const readSchema = (bytes: Uint8Array): Schema => {
	const reader = new CerimalReader(bytes);
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

export const writeSchema = (writer: CerimalWriter, schema: Schema): void => {
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
