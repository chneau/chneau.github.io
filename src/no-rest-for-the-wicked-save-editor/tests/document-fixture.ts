import { base64Encode, type JsonValue } from "../../shared";
import { CerimalWriter, parseGuid } from "../lib/byte-reader";
import { writeDocument } from "../lib/nodes";
import { writeTypeRef } from "../lib/schema";
import { TYPE_INT, TYPE_STRING, type TypeRef } from "../lib/types";

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
		writer.u32(0).u32(members.length << 8);
		writer.u32(1);
		writer.raw(parseGuid(guidText));
		for (const [name, ref] of members) {
			writer.u8(2).name(name);
			writeTypeRef(writer, ref);
		}
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

const sharedItem = (): JsonValue => ({ Label: "a shared label" });

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
		dimensions: multiDimensional ? [[["Grid"], [2, 3]]] : [],
		data: documentData(),
	});
	return writer.finish();
};

export const payloadSaveText = (multiDimensional = true): string =>
	`{"id":"76561198016420457","name":"Charles","revision":2447,"createdAtEpoch":1748808327.0,"info":{"Playtime":137875.9},"binaryInfo":"${base64Encode(
		encodeTestDocument(2, multiDimensional),
	)}","updatedAt":"2025-06-01T12:00:00Z"}`;

export const plainSaveText = (): string =>
	'{"id":"76561198016420457","name":"Charles","revision":2447,"binaryInfo":null,"updatedAt":"2025-06-01T12:00:00Z"}';
