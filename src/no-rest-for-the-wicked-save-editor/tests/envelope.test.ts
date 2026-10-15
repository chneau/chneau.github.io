import { describe, expect, test } from "bun:test";
import { isJsonObject, type JsonValue } from "../../shared";
import {
	asCerimalFile,
	isRecord,
	plainMatches,
	splitWrapper,
	toJsonValue,
	wrapperMatches,
} from "../lib/envelope";
import { decodeSave, encodeSave } from "../lib/format";
import { payloadSaveText, plainSaveText } from "./document-fixture";

const SAVE = payloadSaveText(false);

const SAVE_PAYLOAD = (JSON.parse(SAVE) as { binaryInfo: string }).binaryInfo;

const parsedOf = (text: string): { [key: string]: JsonValue } => {
	const { before, after } = splitWrapper(text);
	const rebuilt = toJsonValue(JSON.parse(`${before}${after}`));
	if (!isJsonObject(rebuilt)) throw new Error("the envelope is not an object.");
	return rebuilt;
};

const envelopeOf = (text: string): { [key: string]: JsonValue } => {
	const without = { ...parsedOf(text) };
	delete without.binaryInfo;
	return without;
};

describe("splitWrapper", () => {
	test("the two halves are the file either side of the payload", () => {
		const { before, after } = splitWrapper(SAVE);
		expect(before.endsWith('"binaryInfo":"')).toBe(true);
		expect(after.startsWith('"')).toBe(true);
		expect(SAVE.startsWith(before)).toBe(true);
		expect(SAVE.endsWith(after)).toBe(true);
		expect(`${before}${after}`).toBe(SAVE.replace(SAVE_PAYLOAD, ""));
		expect(SAVE.slice(before.length, SAVE.length - after.length)).toBe(
			SAVE_PAYLOAD,
		);
	});

	test("the same payload spliced back in gives the file byte for byte", () => {
		const { before, after } = splitWrapper(SAVE);
		for (const spliced of [SAVE_PAYLOAD, "", "AA+/=AAAAAAAAAAAAAAAAAAAAAAAA"]) {
			const rebuilt = `${before}${spliced}${after}`;
			expect(rebuilt.length).toBe(
				before.length + spliced.length + after.length,
			);
			const again = splitWrapper(rebuilt);
			expect(again.before).toBe(before);
			expect(again.after).toBe(after);
		}
		expect(`${before}${SAVE_PAYLOAD}${after}`).toBe(SAVE);
	});

	test("a save with no payload is all before and no after", () => {
		const { before, after } = splitWrapper(plainSaveText());
		expect(after).toBe("");
		expect(before).toBe(plainSaveText());
		const nulled = splitWrapper('{"id":"1","binaryInfo":null}');
		expect(nulled.after).toBe("");
		expect(nulled.before).toBe('{"id":"1","binaryInfo":null}');
	});

	test("a payload the file never closes is refused", () => {
		expect(() => splitWrapper('{"binaryInfo":"AAAAAAAA')).toThrow(
			/binaryInfo field is not terminated/,
		);
	});
});

describe("wrapperMatches", () => {
	test("an untouched wrapper says the payload can be spliced back", () => {
		const { before, after } = splitWrapper(SAVE);
		expect(wrapperMatches(before, after, envelopeOf(SAVE))).toBe(true);
	});

	test("an edited envelope field says it cannot", () => {
		const { before, after } = splitWrapper(SAVE);
		const edited = { ...envelopeOf(SAVE), name: "Wilhelmina" };
		expect(wrapperMatches(before, after, edited)).toBe(false);
		expect(
			wrapperMatches(before, after, { ...envelopeOf(SAVE), extra: 1 }),
		).toBe(false);
		expect(wrapperMatches(before, after, { id: "76561198016420457" })).toBe(
			false,
		);
	});

	test("a wrapper whose halves are not JSON says no rather than throwing", () => {
		expect(wrapperMatches('{"a":', '"1"}', {})).toBe(false);
		expect(wrapperMatches("not json at all", "", {})).toBe(false);
		expect(wrapperMatches("[", "]", {})).toBe(false);
	});

	test("the key order the game wrote is part of the match", () => {
		const { before, after } = splitWrapper(SAVE);
		const envelope = envelopeOf(SAVE);
		const reordered = Object.fromEntries(
			Object.entries(envelope).reverse(),
		) as { [key: string]: JsonValue };
		expect(wrapperMatches(before, after, reordered)).toBe(false);
	});
});

describe("plainMatches", () => {
	test("a payload-less save matches itself", () => {
		const { before } = splitWrapper(plainSaveText());
		expect(plainMatches(before, parsedOf(plainSaveText()))).toBe(true);
	});

	test("and stops matching once the envelope is edited", () => {
		const { before } = splitWrapper(plainSaveText());
		const envelope = parsedOf(plainSaveText());
		expect(plainMatches(before, { ...envelope, revision: 2448 })).toBe(false);
		expect(
			plainMatches('{"createdAtEpoch":1748808327.0}', {
				createdAtEpoch: 1748808327,
			}),
		).toBe(true);
		expect(plainMatches("not json", {})).toBe(false);
	});
});

describe("toJsonValue", () => {
	test("everything JSON has comes back as itself", () => {
		const parsed: unknown = JSON.parse(
			'{"name":"Charles","revision":2447,"hardcore":false,"items":[],"none":null}',
		);
		expect(toJsonValue(parsed)).toEqual({
			name: "Charles",
			revision: 2447,
			hardcore: false,
			items: [],
			none: null,
		});
		expect(toJsonValue(JSON.parse("[1,[2,[3]]]"))).toEqual([1, [2, [3]]]);
	});

	test("what JSON does not have is refused, by name", () => {
		expect(() => toJsonValue(undefined)).toThrow(
			/holds a undefined, which JSON does not have/,
		);
		expect(() => toJsonValue(1n)).toThrow(/holds a bigint/);
		expect(() => toJsonValue(() => 0)).toThrow(/holds a function/);
		expect(() => toJsonValue(Symbol("id"))).toThrow(/holds a symbol/);
		expect(() => toJsonValue(Number.NaN)).toThrow(/JSON cannot represent/);
		expect(() => toJsonValue(Number.POSITIVE_INFINITY)).toThrow(
			/JSON cannot represent/,
		);
	});

	test("it is refused wherever it is found, not only at the root", () => {
		expect(() => toJsonValue({ info: { Playtime: Number.NaN } })).toThrow(
			/JSON cannot represent/,
		);
		expect(() => toJsonValue({ list: [1, undefined] })).toThrow(
			/holds a undefined/,
		);
	});

	test("a document nested too deeply to read is refused", () => {
		let deep: unknown = 0;
		for (let level = 0; level < 300; level += 1) deep = [deep];
		expect(() => toJsonValue(deep)).toThrow(/nests its JSON too deeply/);
		let shallow: JsonValue = 0;
		for (let level = 0; level < 200; level += 1) shallow = [shallow];
		expect(toJsonValue(shallow)).toEqual(shallow);
	});

	test("null is a value, not an absence", () => {
		const record = toJsonValue({ Nothing: null });
		expect(record).toEqual({ Nothing: null });
		if (!isRecord(record)) throw new Error("the record did not hold together.");
		expect(Object.keys(record)).toEqual(["Nothing"]);
	});
});

describe("asCerimalFile", () => {
	const file = (documents: unknown): unknown => ({
		$cerimal: {
			envelope: { name: "Charles" },
			wrapperBefore: '{"name":"Charles","binaryInfo":"',
			wrapperAfter: '"}',
			documents,
		},
	});

	const document = (over: Record<string, unknown> = {}): unknown => ({
		rootType: "TestRoot",
		schema: "AAA=",
		data: { Name: "Charles" },
		...over,
	});

	test("a file of this codec's own making is checked out and returned", () => {
		const decoded = asCerimalFile(toJsonValue(file([document()])));
		expect(Object.keys(decoded.$cerimal)).toEqual([
			"envelope",
			"wrapperBefore",
			"wrapperAfter",
			"documents",
		]);
		const view = decoded.$cerimal.documents[0];
		expect(view?.rootType).toBe("TestRoot");
		expect(view?.data).toEqual({ Name: "Charles" });
		expect(view?.version).toBe(2);
		expect(view?.compression).toBe(0);
		expect(
			asCerimalFile(
				toJsonValue(file([document({ version: 3, compression: 0 })])),
			).$cerimal.documents[0]?.version,
		).toBe(3);
		expect(asCerimalFile(toJsonValue(file([])))).toEqual({
			$cerimal: {
				envelope: { name: "Charles" },
				wrapperBefore: '{"name":"Charles","binaryInfo":"',
				wrapperAfter: '"}',
				documents: [],
			},
		});
	});

	test("paths and array shapes are checked step by step", () => {
		const view = asCerimalFile(
			toJsonValue(
				file([
					document({
						registered: [["Attributes", 0, "value"], ["Name"]],
					}),
				]),
			),
		).$cerimal.documents[0];
		expect(view?.registered).toEqual([["Attributes", 0, "value"], ["Name"]]);
		expect(view?.dimensions).toEqual([]);
		expect(view?.registered.length).toBe(2);
	});

	test("anything that is not this codec's document is refused", () => {
		for (const bad of [[1, 2, 3], "not a document", null]) {
			expect(() => asCerimalFile(toJsonValue(file(bad)))).toThrow(
				/not a list|has no CERIMAL document/,
			);
		}
		expect(() => asCerimalFile(toJsonValue({}))).toThrow(
			/has no CERIMAL section/,
		);
		expect(() =>
			asCerimalFile(toJsonValue({ $cerimal: { documents: [] } })),
		).toThrow(/has no save envelope/);
		expect(() => asCerimalFile(toJsonValue(file([{}])))).toThrow(
			/A CERIMAL document in this file has no data/,
		);
		expect(() =>
			asCerimalFile(toJsonValue(file([document({ rootType: 3 })]))),
		).toThrow(/has no document type name/);
		expect(() =>
			asCerimalFile(toJsonValue(file([document({ schema: 3 })]))),
		).toThrow(/has no document schema/);
		expect(() =>
			asCerimalFile(toJsonValue(file([document({ version: "2" })]))),
		).toThrow(/wants a number for document version/);
		expect(() =>
			asCerimalFile(toJsonValue(file([document({ registered: 3 })]))),
		).toThrow(/shared values is not a list of paths/);
		expect(() =>
			asCerimalFile(toJsonValue(file([document({ registered: [1] })]))),
		).toThrow(/holds something that is not a path/);
		expect(() =>
			asCerimalFile(
				toJsonValue(file([document({ registered: [[{ nope: 1 }]] })])),
			),
		).toThrow(/has an unusable step/);
		expect(() =>
			asCerimalFile(toJsonValue(file([document({ dimensions: 3 })]))),
		).toThrow(/array shapes are not a list/);
		expect(() =>
			asCerimalFile(
				toJsonValue(
					file([document({ dimensions: [{ path: 3, extents: [2] }] })]),
				),
			),
		).toThrow(/array shape/);
		expect(() =>
			asCerimalFile(
				toJsonValue({
					$cerimal: { envelope: {}, wrapperAfter: '"}', documents: [] },
				}),
			),
		).toThrow(/has no save wrapper/);
	});

	test("an array shape with no path or with an unusable extent is refused", () => {
		for (const shape of [
			{ path: [], extents: [2, 3] },
			{ extents: [2, 3] },
			{ path: [["Grid"]], extents: ["2", "3"] },
		]) {
			expect(() =>
				asCerimalFile(toJsonValue(file([document({ dimensions: [shape] })]))),
			).toThrow(/array shape|array extent/);
		}
		const view = asCerimalFile(
			toJsonValue(file([document({ dimensions: [[["Grid"], [2, 3]]] })])),
		).$cerimal.documents[0];
		expect(view?.dimensions).toEqual([[["Grid"], [2, 3]]]);
	});
});

describe("a save through the whole codec", () => {
	test("an untouched save comes back byte for byte", async () => {
		const original = new TextEncoder().encode(payloadSaveText(false));
		const document_ = await decodeSave(original);
		const rebuilt = await encodeSave(document_);
		expect([...rebuilt]).toEqual([...original]);
		expect(new TextDecoder().decode(rebuilt)).toContain("1748808327.0");
		expect(new TextDecoder().decode(rebuilt)).toBe(payloadSaveText(false));
	});

	test("the payload is read, shared value and all", async () => {
		const document_ = await decodeSave(
			new TextEncoder().encode(payloadSaveText(false)),
		);
		const view = document_.$cerimal.documents[0];
		expect(view?.rootType).toBe("TestRoot");
		expect(document_.$cerimal.envelope.name).toBe("Charles");
		expect(document_.$cerimal.envelope.binaryInfo).toBeUndefined();
		expect(document_.$cerimal.wrapperBefore).toContain('"binaryInfo":"');
		expect(document_.$cerimal.wrapperAfter.startsWith('"')).toBe(true);
	});

	test("an edited envelope is written back, not spliced", async () => {
		const document_ = await decodeSave(
			new TextEncoder().encode(payloadSaveText(false)),
		);
		const edited = {
			$cerimal: {
				...document_.$cerimal,
				envelope: { ...document_.$cerimal.envelope, name: "Wilhelmina" },
			},
		};
		const text = new TextDecoder().decode(await encodeSave(edited));
		expect(text).toContain('"name":"Wilhelmina"');
		expect(text).not.toContain("1748808327.0");
		const reread = await decodeSave(new TextEncoder().encode(text));
		expect(reread.$cerimal.envelope.name).toBe("Wilhelmina");
		expect(reread.$cerimal.documents[0]?.rootType).toBe("TestRoot");
	});

	test("a payload-less save comes back byte for byte too", async () => {
		const original = new TextEncoder().encode(plainSaveText());
		const document_ = await decodeSave(original);
		expect(document_.$cerimal.documents).toHaveLength(0);
		expect(document_.$cerimal.wrapperAfter).toBe("");
		expect(document_.$cerimal.envelope.binaryInfo).toBeNull();
		expect([...(await encodeSave(document_))]).toEqual([...original]);
	});

	test("a save that is not one is refused rather than half-read", async () => {
		await expect(
			decodeSave(new TextEncoder().encode("not a save at all")),
		).rejects.toThrow(/does not parse as JSON/);
		await expect(
			decodeSave(
				new TextEncoder().encode('{"id":"1","binaryInfo":"AAAAAAAAAAAA"}'),
			),
		).rejects.toThrow(/not a CERIMAL document/);
	});

	test("a document that does not fit its schema is refused on the way out", async () => {
		const document_ = await decodeSave(
			new TextEncoder().encode(payloadSaveText(false)),
		);
		const view = document_.$cerimal.documents[0];
		if (!view || !isRecord(view.data)) throw new Error("no document to edit.");
		const broken = {
			$cerimal: {
				...document_.$cerimal,
				documents: [{ ...view, data: { ...view.data, Name: 3 } }],
			},
		};
		await expect(encodeSave(broken)).rejects.toThrow(/wants text for STRING/);
	});
});
