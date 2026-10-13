/**
 * A CERIMAL document assembled in the test suite rather than read from a file.
 *
 * `tests/format.test.ts` holds the byte-exactness tests, and they read real
 * `.dat` files that live outside this repository — so on a machine without them
 * every one of those tests skips, and the write path this codec's whole promise
 * rests on has no coverage at all. This is the substitute: a schema and a
 * document built here from the format's own layout, so the reader, the writer
 * and the tag layer are exercised over a graph whose shape is known exactly.
 *
 * The graph is chosen for the three things a hand-built document can show that a
 * real one only shows by luck: a **null** node, a value **referred to twice**
 * through the back-reference table (so the reader must hand back one instance,
 * not two equal ones), and an **array** — which, when its rank is above one,
 * needs its extents carried beside the flattened document because `[2,3]` and
 * `[6,1,1]` hold the same six elements and only the file knows which it meant.
 */
import { base64Encode, type JsonValue } from "../../shared";
import { CerimalWriter, parseGuid } from "../lib/byte-reader";
import { writeDocument } from "../lib/nodes";
import { writeTypeRef } from "../lib/schema";
import { TYPE_INT, TYPE_STRING, type TypeRef } from "../lib/types";

/** Two type GUIDs, made up but well-formed and never used by a real save. */
const ROOT_GUID = "11111111-2222-3333-4444-555555555555";
const ITEM_GUID = "66666666-7777-8888-9999-aaaaaaaaaaaa";

const named = (guidText: string): TypeRef => ({
	kind: "named",
	guid: parseGuid(guidText),
	guidText,
	typeArgs: [],
});

const primitive = (wellKnown: number): TypeRef => ({
	kind: "primitive",
	wellKnown,
});

/**
 * The schema, written out by hand from the layout `readSchema` navigates.
 *
 * Deliberately not built through `writeSchema`: a schema that only ever
 * round-trips through the project's own writer proves the two agree, not that
 * either matches the format the game writes.
 */
const schemaBytes = (multiDimensional = true): Uint8Array => {
	const grid: TypeRef = multiDimensional
		? { kind: "array", rank: 2, element: primitive(TYPE_INT) }
		: { kind: "array", rank: 1, element: primitive(TYPE_INT) };
	const writer = new CerimalWriter(256);
	writer.u32(1);
	const sizesAt = writer.length;
	writer.u32(0).u32(2).u32(0);
	const define = (
		guidText: string,
		members: readonly (readonly [string, TypeRef])[],
	): void => {
		const start = writer.length;
		// Flags: kind 0 is a class, and the member count sits at bit 8.
		writer.u32(0).u32(members.length << 8);
		writer.u32(1);
		writer.raw(parseGuid(guidText));
		for (const [name, ref] of members) {
			writer.u8(2).name(name);
			writeTypeRef(writer, ref);
		}
		// The recorded size excludes the twenty-eight bytes of header above it.
		writer.patchU32(start, writer.length - start - 28);
	};
	define(ROOT_GUID, [
		["Name", primitive(TYPE_STRING)],
		["Item", named(ITEM_GUID)],
		["Alias", named(ITEM_GUID)],
		["Nothing", primitive(TYPE_STRING)],
		["Grid", grid],
	]);
	define(ITEM_GUID, [["Label", primitive(TYPE_STRING)]]);
	const definitionsEnd = writer.length;
	writer.sevenBitName("TestRoot").sevenBitName("TestItem");
	writer.patchU32(sizesAt, definitionsEnd - (sizesAt + 12));
	writer.patchU32(sizesAt + 8, writer.length - definitionsEnd);
	writeTypeRef(writer, named(ROOT_GUID));
	return writer.finish();
};

/** The item both fields point at: one object, referred to twice. */
const sharedItem = (): JsonValue => ({ Label: "a shared label" });

/** The graph the document carries, with the sharing the tag layer exists for. */
export const documentData = (): JsonValue => {
	const shared = sharedItem();
	return {
		Name: "Charles",
		Item: shared,
		Alias: shared,
		Nothing: null,
		Grid: [1, 2, 3, 4, 5, 6],
	};
};

/** One CERIMAL document, magic included, ready to be spliced into a save. */
export const encodeTestDocument = (
	version = 2,
	multiDimensional = true,
): Uint8Array => {
	const writer = new CerimalWriter(256);
	writeDocument(writer, {
		rootType: "TestRoot",
		version,
		compression: 0,
		schema: base64Encode(schemaBytes(multiDimensional)),
		registered: [["Item"]],
		// The `[path, extents]` pair `readDocument` produces and `writeDocument`
		// consumes — which is *not* the shape `asCerimalFile` reads, so a save
		// with a multi-dimensional array cannot be encoded back. See the note in
		// `tests/envelope.test.ts`; nothing here may be changed to hide it.
		dimensions: multiDimensional ? [[["Grid"], [2, 3]]] : [],
		data: documentData(),
	});
	return writer.finish();
};

/**
 * A whole `.dat` file with a CERIMAL payload, its wrapper text written the way
 * the game writes it: compact, in the game's own key order, and with a number
 * formatted as `JSON.stringify` would not format it.
 */
export const payloadSaveText = (multiDimensional = true): string =>
	`{"id":"76561198016420457","name":"Charles","revision":2447,"createdAtEpoch":1748808327.0,"info":{"Playtime":137875.9},"binaryInfo":"${base64Encode(
		encodeTestDocument(2, multiDimensional),
	)}","updatedAt":"2025-06-01T12:00:00Z"}`;

/**
 * The same save with no CERIMAL stream — an account or settings file — which is
 * a `binaryInfo` holding null rather than a base64 string.
 */
export const plainSaveText = (): string =>
	'{"id":"76561198016420457","name":"Charles","revision":2447,"binaryInfo":null,"updatedAt":"2025-06-01T12:00:00Z"}';
