/**
 * The envelope: the split around the base64 payload, the field-by-field check
 * that a document really is one of this codec's, and the `unknown` a
 * `JSON.parse` hands back, narrowed.
 *
 * These are the functions the write path is built on and the only place in this
 * codec where `unknown` crosses into a consumer. A branch missed here does not
 * throw — it writes a save the game cannot read, or splices a payload into text
 * that no longer matches it — so each branch is asserted on both its answer and
 * its refusal.
 *
 * The contract that matters is stated in `splitWrapper` and is the whole reason
 * the wrapper is carried as two halves rather than re-serialised: putting a
 * payload back between the halves the file was split into must return that file
 * byte for byte. The real-save tests in `format.test.ts` assert it over eleven
 * `.dat` files that live outside this repository and are skipped where they are
 * absent, so it is asserted here over `document-fixture.ts`, which is always
 * present.
 */
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

/** A save's own text, as the game writes it: compact, key order and all. */
const SAVE = payloadSaveText(false);

/** The base64 payload inside `SAVE`, which is what the halves sit either side of. */
const SAVE_PAYLOAD = (JSON.parse(SAVE) as { binaryInfo: string }).binaryInfo;

/** A save's own fields, read back out of its text as `decodeSave` reads them. */
const parsedOf = (text: string): { [key: string]: JsonValue } => {
	const { before, after } = splitWrapper(text);
	const rebuilt = toJsonValue(JSON.parse(`${before}${after}`));
	if (!isJsonObject(rebuilt)) throw new Error("the envelope is not an object.");
	return rebuilt;
};

/**
 * The envelope a save with a payload carries: its own fields less the payload.
 * A save with no payload keeps its `binaryInfo` — a null — because that null is
 * what tells the two apart.
 */
const envelopeOf = (text: string): { [key: string]: JsonValue } => {
	const without = { ...parsedOf(text) };
	delete without.binaryInfo;
	return without;
};

describe("splitWrapper", () => {
	test("the two halves are the file either side of the payload", () => {
		const { before, after } = splitWrapper(SAVE);
		// The halves overlap the payload by exactly the quote that introduces it
		// and the quote that closes it, which is what makes the splice below a
		// concatenation rather than an edit.
		expect(before.endsWith('"binaryInfo":"')).toBe(true);
		expect(after.startsWith('"')).toBe(true);
		expect(SAVE.startsWith(before)).toBe(true);
		expect(SAVE.endsWith(after)).toBe(true);
		// The halves alone are the file *less* its payload — concatenating them
		// leaves `"binaryInfo":""`, which is the one thing `wrapperMatches` relies
		// on to read back what the wrapper originally wrapped.
		expect(`${before}${after}`).toBe(SAVE.replace(SAVE_PAYLOAD, ""));
		expect(SAVE.slice(before.length, SAVE.length - after.length)).toBe(
			SAVE_PAYLOAD,
		);
	});

	test("the same payload spliced back in gives the file byte for byte", () => {
		const { before, after } = splitWrapper(SAVE);
		// Three shapes of payload: the one that was there, an empty one, and one
		// with the base64 alphabet's awkward characters in it. A base64 payload
		// contains no quote and no backslash, so the half-split is unambiguous
		// for all of them.
		for (const spliced of [SAVE_PAYLOAD, "", "AA+/=AAAAAAAAAAAAAAAAAAAAAAAA"]) {
			const rebuilt = `${before}${spliced}${after}`;
			expect(rebuilt.length).toBe(
				before.length + spliced.length + after.length,
			);
			// And the split of the rebuilt text is the same split, so the operation
			// is a fixed point rather than one that drifts on each pass.
			const again = splitWrapper(rebuilt);
			expect(again.before).toBe(before);
			expect(again.after).toBe(after);
		}
		expect(`${before}${SAVE_PAYLOAD}${after}`).toBe(SAVE);
	});

	test("a save with no payload is all before and no after", () => {
		// The account and settings saves have no CERIMAL stream, and that is what
		// the empty `after` says. The whole file is the wrapper.
		const { before, after } = splitWrapper(plainSaveText());
		expect(after).toBe("");
		expect(before).toBe(plainSaveText());
		// A `binaryInfo` that is null is not a payload either: the key holds no
		// string, so there is nothing to splice.
		const nulled = splitWrapper('{"id":"1","binaryInfo":null}');
		expect(nulled.after).toBe("");
		expect(nulled.before).toBe('{"id":"1","binaryInfo":null}');
	});

	test("a payload the file never closes is refused", () => {
		// A truncated save must be named rather than read as an envelope with no
		// payload: the second reading would write the file back without its
		// character, which the game reads as a save with no character in it.
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
		// So does a field added or dropped, and a value changed to another of the
		// same type: the comparison is of the whole envelope, not of one field.
		expect(
			wrapperMatches(before, after, { ...envelopeOf(SAVE), extra: 1 }),
		).toBe(false);
		expect(wrapperMatches(before, after, { id: "76561198016420457" })).toBe(
			false,
		);
	});

	test("a wrapper whose halves are not JSON says no rather than throwing", () => {
		// The two halves come from a file, so what they are cannot be assumed;
		// the answer to "can this be spliced" is allowed to be no.
		expect(wrapperMatches('{"a":', '"1"}', {})).toBe(false);
		expect(wrapperMatches("not json at all", "", {})).toBe(false);
		// And a pair of halves that parses to something that is not an object
		// cannot be an envelope either.
		expect(wrapperMatches("[", "]", {})).toBe(false);
	});

	test("the key order the game wrote is part of the match", () => {
		// The envelope is compared as serialised text, so the game's own order is
		// what makes an untouched save spliceable — which is the reason the
		// wrapper halves are kept rather than the envelope re-ordered.
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
		// A number the game formatted as `2447.0` and `JSON.parse` hands back as
		// `2447` still matches: the comparison is of values, so re-writing a
		// payload-less save in another number format costs nothing.
		expect(
			plainMatches('{"createdAtEpoch":1748808327.0}', {
				createdAtEpoch: 1748808327,
			}),
		).toBe(true);
		// Text that is not JSON is not an envelope.
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
		// An array at the root is a document the codec cannot use, but narrowing
		// it is not this function's job: the caller decides what a save is.
		expect(toJsonValue(JSON.parse("[1,[2,[3]]]"))).toEqual([1, [2, [3]]]);
	});

	test("what JSON does not have is refused, by name", () => {
		// A document may only reach a consumer as a `JsonValue`, so each of these
		// has to be refused here rather than narrowed into one. `undefined` is the
		// one that matters most: it is what an absent key hands back, and passing
		// it on would put a key in the document the file never had.
		expect(() => toJsonValue(undefined)).toThrow(
			/holds a undefined, which JSON does not have/,
		);
		expect(() => toJsonValue(1n)).toThrow(/holds a bigint/);
		expect(() => toJsonValue(() => 0)).toThrow(/holds a function/);
		expect(() => toJsonValue(Symbol("id"))).toThrow(/holds a symbol/);
		// And a number JSON cannot spell back: `JSON.stringify` writes `null` for
		// it, which would silently change the save's own values.
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
		// The limit is on depth rather than on size, because a cycle cannot come
		// out of `JSON.parse` but a very deep save can, and a recursive walk over
		// one is a stack overflow with no message rather than an error.
		let deep: unknown = 0;
		for (let level = 0; level < 300; level += 1) deep = [deep];
		expect(() => toJsonValue(deep)).toThrow(/nests its JSON too deeply/);
		// Just inside the limit is read, not refused.
		let shallow: JsonValue = 0;
		for (let level = 0; level < 200; level += 1) shallow = [shallow];
		expect(toJsonValue(shallow)).toEqual(shallow);
	});

	test("null is a value, not an absence", () => {
		// The document carries `null` in the places a node was a null tag, and
		// those keys must survive: dropping them would make the re-encoder write a
		// field where the file had none.
		const record = toJsonValue({ Nothing: null });
		expect(record).toEqual({ Nothing: null });
		if (!isRecord(record)) throw new Error("the record did not hold together.");
		expect(Object.keys(record)).toEqual(["Nothing"]);
	});
});

describe("asCerimalFile", () => {
	/** A file as `decodeSave` builds it, minus the document under test. */
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
		// The two fields the format's version 3 added default to what a version 2
		// document would have held, so an older save is read without a special
		// case — and a document that declares them keeps them.
		expect(view?.version).toBe(2);
		expect(view?.compression).toBe(0);
		expect(
			asCerimalFile(
				toJsonValue(file([document({ version: 3, compression: 0 })])),
			).$cerimal.documents[0]?.version,
		).toBe(3);
		// A save with no CERIMAL section at all is a valid one: documents empty.
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
		// A registered path is a list of keys and indices; a number is an index,
		// which is why the segments are typed rather than split from a string.
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
		// Absent is an ordinary outcome and defaults to nothing to walk.
		expect(view?.dimensions).toEqual([]);
		expect(view?.registered.length).toBe(2);
	});

	test("anything that is not this codec's document is refused", () => {
		// Every one of these is a document that reached `encode` from an editor
		// the user has since changed, and each must fail the check rather than
		// produce a file from a guess.
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
		// An object shape — `{ path, extents }` — is not the tuple this codec
		// writes, so it is still refused; only its reason changed.
		expect(() =>
			asCerimalFile(
				toJsonValue(
					file([document({ dimensions: [{ path: 3, extents: [2] }] })]),
				),
			),
		).toThrow(/array shape/);
		// The wrapper is not optional: without it the payload has nowhere to go,
		// and a file written without it would lose the game's own formatting.
		expect(() =>
			asCerimalFile(
				toJsonValue({
					$cerimal: { envelope: {}, wrapperAfter: '"}', documents: [] },
				}),
			),
		).toThrow(/has no save wrapper/);
	});

	test("an array shape with no path or with an unusable extent is refused", () => {
		// The path is what says which array the extents belong to, and the
		// extents are what make a flattened array writable at all. These are the
		// object-shaped entries `asCerimalFile` reads — see the note on the
		// fixture's `dimensions` below for what the codec itself writes.
		for (const shape of [
			{ path: [], extents: [2, 3] },
			{ extents: [2, 3] },
			{ path: [["Grid"]], extents: ["2", "3"] },
		]) {
			expect(() =>
				asCerimalFile(toJsonValue(file([document({ dimensions: [shape] })]))),
			).toThrow(/array shape|array extent/);
		}
		// The shape this codec actually writes — the `[path, extents]` pair
		// `readDocument` produces and `writeDocument` consumes — is accepted.
		// It used to be refused outright, because the reader expected an object
		// `{ path, extents }` this codec never emits: a save holding a
		// multi-dimensional array decoded and then could not be saved back.
		const view = asCerimalFile(
			toJsonValue(file([document({ dimensions: [[["Grid"], [2, 3]]] })])),
		).$cerimal.documents[0];
		expect(view?.dimensions).toEqual([[["Grid"], [2, 3]]]);
	});
});

describe("a save through the whole codec", () => {
	test("an untouched save comes back byte for byte", async () => {
		// The contract `splitWrapper` exists to keep, asserted end to end on a
		// payload built here: decode, encode, compare the bytes.
		const original = new TextEncoder().encode(payloadSaveText(false));
		const document_ = await decodeSave(original);
		const rebuilt = await encodeSave(document_);
		expect([...rebuilt]).toEqual([...original]);
		// Including the number formatting and the key order the game wrote, which
		// is what a re-serialised envelope would have lost.
		expect(new TextDecoder().decode(rebuilt)).toContain("1748808327.0");
		expect(new TextDecoder().decode(rebuilt)).toBe(payloadSaveText(false));
	});

	test("the payload is read, shared value and all", async () => {
		const document_ = await decodeSave(
			new TextEncoder().encode(payloadSaveText(false)),
		);
		const view = document_.$cerimal.documents[0];
		expect(view?.rootType).toBe("TestRoot");
		// The envelope is the game's JSON under its own key names, with the
		// payload taken out of it.
		expect(document_.$cerimal.envelope.name).toBe("Charles");
		expect(document_.$cerimal.envelope.binaryInfo).toBeUndefined();
		expect(document_.$cerimal.wrapperBefore).toContain('"binaryInfo":"');
		expect(document_.$cerimal.wrapperAfter.startsWith('"')).toBe(true);
	});

	test("an edited envelope is written back, not spliced", async () => {
		const document_ = await decodeSave(
			new TextEncoder().encode(payloadSaveText(false)),
		);
		// The same trade `format.test.ts` makes over a real save, over this one:
		// the payload is still there and still readable, and the game's own
		// number formatting is gone.
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
		// A payload that parses and is not CERIMAL: the envelope check would pass,
		// so this is the payload that says no.
		await expect(
			decodeSave(
				new TextEncoder().encode('{"id":"1","binaryInfo":"AAAAAAAAAAAA"}'),
			),
		).rejects.toThrow(/not a CERIMAL document/);
	});

	test("a document that does not fit its schema is refused on the way out", async () => {
		// The envelope is fine and the payload is a real document, but the data no
		// longer matches the types it was read with. The writer must refuse rather
		// than write a field the schema does not have.
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
