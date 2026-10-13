/**
 * Write-path tests for the GVAS container: the header, the unlabelled byte, and
 * the property-tag stream that follows it.
 *
 * ## Why these build their own bytes
 *
 * The rest of this suite reads two committed saves from a sibling checkout and
 * skips itself when they are not there, so on a machine without them most of
 * what is asserted here is the only evidence the write path has. The fixtures
 * below are assembled by hand from `DataView` rather than with the codec's own
 * `UnrealWriter`: a round-trip test whose fixture was produced by the writer
 * under test cannot fail when both halves drift together, which is the failure
 * this is meant to catch. Every field is written little-endian by hand and the
 * offsets are then checked, so a change to either side of the format has to be
 * made in two places before it stops being noticed.
 *
 * The 85 custom versions, the class name and the branch string are the real
 * values from `SaveSlot_DDR_0.sav`, and the layout offsets they produce match
 * the ones measured off that file and recorded in `gvas.ts`.
 */
import { describe, expect, test } from "bun:test";
import {
	type Bytes,
	bytesEqual,
	firstDifference,
	isJsonObject,
	type JsonValue,
	requireArrayAt,
	requireNumberAt,
	requireObjectAt,
	requireStringAt,
} from "../../shared";
import { deadlyDays } from "../lib/format";

/** Where the property list starts in the committed save, from `gvas.ts`. */
const PROPERTY_LIST_OFFSET = 1804;

/** The byte before it, whose meaning the file does not disclose. */
const CONTAINER_TAG_OFFSET = 1803;

/** What `"None"` costs on the wire: four bytes of length, four, a terminator. */
const CLOSING_NONE = 9;

const CLASS_NAME = "/Script/PixelsplitSaveSystem.PixelSaveGame";
const BRANCH = "++UE5+Release-5.7";

/**
 * The first three of the committed save's custom versions.
 *
 * Enough to pin the word-swapped GUID layout and the count field; the table is
 * generated to 85 below so its length is the one the real save has.
 */
const REAL_GUIDS = [
	"9c54d522-a826-4fbe-9421-074661b482d0",
	"fa2e1ad1-8a1e-4b1f-b1b9-3a2b8f9a2c31",
	"b3c4d5e6-f708-4192-8a3b-9c4d5e6f7081",
] as const;

/** 85 GUIDs, the first three real and the rest generated but well-formed. */
const customVersions = (
	count: number,
): readonly { id: string; version: number }[] =>
	Array.from({ length: count }, (_unused, index) => {
		const hex = index.toString(16).padStart(12, "0");
		const id = REAL_GUIDS[index] ?? `f7084192-8a3b-4c5d-${hex}-e6f7081a2b3c`;
		return { id, version: 1000 + index };
	});

/** A `DataView`-backed little-endian byte builder, for the fixtures below. */
class Le {
	private bytes: number[] = [];

	u8(value: number): this {
		this.bytes.push(value & 0xff);
		return this;
	}

	u16(value: number): this {
		return this.u8(value).u8(value >> 8);
	}

	u32(value: number): this {
		return this.u8(value)
			.u8(value >> 8)
			.u8(value >> 16)
			.u8(value >> 24);
	}

	i32(value: number): this {
		return this.u32(value);
	}

	/**
	 * An `FString`, in whichever of Unreal's two forms it is stored.
	 *
	 * A string with a character above `0x7f` in it is UTF-16 with a *negative*
	 * length, and the length counts UTF-16 code units including the terminator.
	 * One that is pure ASCII is stored as bytes with a positive length. The rule
	 * is `needsUtf16`'s, reproduced here so the fixture is written by hand rather
	 * than by the writer it is testing.
	 */
	fString(value: string): this {
		if (value === "") return this.i32(0);
		if ([...value].some((character) => character.charCodeAt(0) > 0x7f)) {
			const bytes = new Uint8Array(value.length * 2 + 2);
			const view = new DataView(bytes.buffer);
			for (let index = 0; index < value.length; index += 1) {
				view.setUint16(index * 2, value.charCodeAt(index), true);
			}
			return this.i32(-(value.length + 1)).raw(bytes);
		}
		const bytes = new TextEncoder().encode(value);
		return this.i32(bytes.length + 1)
			.raw(bytes)
			.u8(0);
	}

	/** A GUID as four little-endian words, the permutation `gvas.ts` documents. */
	guid(id: string): this {
		const hex = id.replace(/-/g, "");
		for (let word = 0; word < 4; word += 1) {
			this.u32(Number.parseInt(hex.slice(word * 8, word * 8 + 8), 16));
		}
		return this;
	}

	raw(bytes: Bytes): this {
		for (const byte of bytes) this.bytes.push(byte);
		return this;
	}

	build(): Bytes {
		return new Uint8Array(this.bytes);
	}
}

/**
 * One property tag, as the tag stream carries it.
 *
 * `size` excludes the `hasGuid` byte and the GUID behind it, which is the
 * exclusion `writeProperty` subtracts, so `body` here is what `size` counts.
 */
const intProperty = (le: Le, name: string, value: number, bodySize = 4): Le =>
	le.fString(name).fString("IntProperty").i32(0).i32(bodySize).u8(0).i32(value);

/**
 * A save carrying `count` custom versions and the given property tags.
 *
 * The header is written out in full and at the documented offsets; `list` is
 * written verbatim, so a test can put any tag stream it likes after it.
 */
const saveWith = (
	count: number,
	containerTag: number,
	list: (le: Le) => void,
): Bytes => {
	const le = new Le();
	le.raw(new TextEncoder().encode("GVAS"));
	le.i32(3); // SaveGameFileVersion
	le.i32(522); // SaveGameVersion
	le.i32(1018); // PackageFileUE5Version
	le.u16(5); // FEngineVersion.Major
	le.u16(7); // FEngineVersion.Minor
	le.u16(4); // FEngineVersion.Patch
	le.u32(51_494_982); // FEngineVersion.Changelist
	le.fString(BRANCH);
	le.i32(3); // CustomVersionFormat
	le.i32(count);
	for (const custom of customVersions(count))
		le.guid(custom.id).i32(custom.version);
	le.fString(CLASS_NAME);
	le.u8(containerTag);
	list(le);
	return le.build();
};

/** The 85-custom-version save the committed file's header describes. */
const headerSave = (containerTag = 0): Bytes =>
	saveWith(85, containerTag, (le) => {
		intProperty(le, "Balance", 17);
		le.fString("None");
	});

/**
 * A save holding one `ArrayProperty` whose single element is `payload` bytes.
 *
 * Returns the payload too, because the two tests below assert on where it sits
 * rather than only that it survives.
 */
const byteArraySave = (name: string, payload: Bytes): Bytes =>
	saveWith(1, 0, (le) => {
		le.fString(name)
			.fString("ArrayProperty")
			.i32(0)
			.i32(13) // the inner type name's length, terminator included
			.raw(new TextEncoder().encode("ByteProperty\u0000"))
			.i32(0) // item type index
			.i32(4 + payload.length) // body size, excluding the hasGuid byte
			.u8(0) // element hasGuid
			.i32(payload.length)
			.raw(payload);
		le.fString("None");
	});

/**
 * A save whose single array element is a property list in its own right.
 *
 * The nested case this codec exists to decode: a `TArray<uint8>` whose payload
 * is a property-tag stream behind a one-byte version. `tryReadBlob` accepts one
 * only if writing it straight back out reproduces the bytes exactly, so a blob
 * that decodes is a blob that also re-encodes.
 */
const blobSave = (
	balance: number,
): {
	readonly bytes: Bytes;
	readonly payload: Bytes;
	/** Where `Balance`'s four bytes sit in the finished file. */
	readonly valueAt: number;
} => {
	const inner = new Le();
	inner.u8(2); // the blob's own version byte
	intProperty(inner, "Balance", balance);
	inner.fString("None");
	const payload = inner.build();
	const bytes = byteArraySave("SaveData", payload);
	// The payload ends `CLOSING_NONE` bytes short of the end of the file, and
	// `Balance`'s value ends `CLOSING_NONE` bytes short of the end of the
	// payload — there is a closing `"None"` at each level, not one between them.
	const valueAt =
		bytes.length -
		CLOSING_NONE -
		payload.length +
		payload.length -
		CLOSING_NONE -
		4;
	return { bytes, payload, valueAt };
};

const decode = (bytes: Bytes) => deadlyDays.decode(bytes);

/**
 * Narrowing helpers for a decoded document.
 *
 * A decoded save is a `JsonValue` and every assertion below wants a field out of
 * it, so the shared `require*At` readers are what narrow one: each refuses a
 * document that has lost the field, so a change to the document's shape fails
 * here with a message naming it rather than quietly reading `undefined`. The
 * alternative — casting a `JsonValue` to a hand-written shape — would be a cast
 * between two of this codebase's own types, which buys silence and owes the
 * next reader a lie.
 */

/** The save's property tags, in order, each narrowed to an object. */
const propertiesOf = (
	doc: JsonValue,
): readonly { readonly [key: string]: JsonValue }[] =>
	requireArrayAt(requireObjectAt(doc, "list"), "properties").map((tag) => {
		if (!isJsonObject(tag)) {
			throw new Error("a property tag is not an object.");
		}
		return tag;
	});

/** The first property tag, which is the one the array-value tests read. */
const firstPropertyOf = (
	doc: JsonValue,
): { readonly [key: string]: JsonValue } => {
	const first = propertiesOf(doc)[0];
	if (first === undefined) throw new Error("the save has no properties.");
	return first;
};

/** The `kind` of each item of the first tag's array value. */
const firstArrayItemKinds = (doc: JsonValue): readonly string[] =>
	requireArrayAt(requireObjectAt(firstPropertyOf(doc), "value"), "items").map(
		(item) => requireStringAt(item, "kind"),
	);

/** Each item of the first tag's array value, as the raw numbers a byte run is. */
const firstArrayItemBytes = (doc: JsonValue): readonly number[] =>
	requireArrayAt(requireObjectAt(firstPropertyOf(doc), "value"), "items").map(
		(item) => requireNumberAt(item, "value"),
	);

/** The first tag's property name. */
const firstPropertyName = (doc: JsonValue): string =>
	requireStringAt(firstPropertyOf(doc), "name");

/** The first tag's value's declared type, which is its wire type. */
const firstPropertyType = (doc: JsonValue): string =>
	requireStringAt(requireObjectAt(firstPropertyOf(doc), "value"), "type");

/** Every property tag's name, in order. */
const propertyNames = (doc: JsonValue): readonly string[] =>
	propertiesOf(doc).map((tag) => requireStringAt(tag, "name"));

/** The container's custom-version table, as `{ id, version }` pairs. */
const customVersionsOf = (
	doc: JsonValue,
): readonly { readonly id: string; readonly version: number }[] =>
	requireArrayAt(doc, "customVersions").map((entry) => ({
		id: requireStringAt(entry, "id"),
		version: requireNumberAt(entry, "version"),
	}));

const rebuild = async (bytes: Bytes): Promise<Bytes> =>
	await deadlyDays.encode(await deadlyDays.decode(bytes));

describe("the GVAS container header", () => {
	test("has the eighty-five custom versions, at the offsets it claims", async () => {
		const bytes = headerSave();
		// The header is 1 803 bytes and the property list starts at 1 804, both
		// measured off `SaveSlot_DDR_0.sav`. A fixture that lands elsewhere would
		// mean the round trip below was proving something about the wrong layout.
		expect(bytes[CONTAINER_TAG_OFFSET]).toBe(0);
		// The first property's name length, read straight out of the bytes.
		expect([
			...bytes.subarray(PROPERTY_LIST_OFFSET, PROPERTY_LIST_OFFSET + 4),
		]).toEqual([8, 0, 0, 0]); // "Balance" plus its terminator
		const save = await decode(bytes);
		expect(customVersionsOf(save)).toHaveLength(85);
		expect(customVersionsOf(save)[0]).toEqual({
			id: "9c54d522-a826-4fbe-9421-074661b482d0",
			version: 1000,
		});
		expect(customVersionsOf(save)[84]?.version).toBe(1084);
		expect(requireNumberAt(save, "customVersionFormat")).toBe(3);
		expect(requireStringAt(save, "saveGameType")).toBe(CLASS_NAME);
		expect(requireStringAt(requireObjectAt(save, "engine"), "branch")).toBe(
			BRANCH,
		);
		expect(propertyNames(save)).toEqual(["Balance"]);
	});

	test("re-encodes all eighty-five versions byte for byte", async () => {
		// The largest single thing in the header and the easiest to lose: a codec
		// that dropped, reordered or reformatted the table still reads back
		// correctly and still writes a file the engine refuses.
		const bytes = headerSave();
		const rebuilt = await rebuild(bytes);
		expect(firstDifference(bytes, rebuilt)).toBeUndefined();
		expect(rebuilt).toHaveLength(bytes.length);
		// Independently: the table is still eighty-five GUID-and-version pairs at
		// the same offsets, so identity is not just "the codec agrees with itself".
		expect(rebuilt.subarray(56, 56 + 85 * 20)).toEqual(
			bytes.subarray(56, 56 + 85 * 20),
		);
	});

	test("keeps the count field and the table in step when they disagree", async () => {
		// Four versions claimed, five written. The extra bytes are then read as
		// the save class name, so the two cannot be silently reconciled — which is
		// the point: the count is the field the engine trusts.
		const bytes = saveWith(4, 0, (le) => {
			intProperty(le, "Balance", 17);
			le.fString("None");
		});
		expect(customVersionsOf(await decode(bytes))).toHaveLength(4);
		expect(await rebuild(bytes)).toEqual(bytes);
	});

	test("refuses a custom-version count the remaining bytes cannot hold", async () => {
		// 0x7fffffff versions would spin for a long time before any bounds check
		// fired, so the count is checked against what is left.
		const bytes = headerSave();
		const tampered = bytes.slice();
		// CustomVersionCount sits at 52: 49 after the branch string, then the
		// format field and the count field.
		tampered.set([0xff, 0xff, 0xff, 0x7f], 52);
		await expect(decode(tampered)).rejects.toThrow(/custom versions/);
	});
});

describe("the unlabelled byte", () => {
	test("is carried through rather than assumed to be zero", async () => {
		// `gvas.ts` records that writing `1` there still decodes, so the byte is
		// preserved verbatim rather than normalised — which is what makes an
		// untouched save re-encode to identical bytes whatever it holds.
		const bytes = headerSave(0);
		const odd = headerSave(0x5a);
		expect(odd[CONTAINER_TAG_OFFSET]).toBe(0x5a);
		expect(await decode(odd)).toHaveProperty("containerTag", 0x5a);
		expect(await rebuild(odd)).toEqual(odd);
		// And the zero-valued case still round-trips, which is the one a
		// normalisation bug would still pass.
		expect(await rebuild(bytes)).toEqual(bytes);
	});

	test("is not the property list, and losing it would show", async () => {
		// The byte is between the class name and the first tag. Deleting it moves
		// the list one byte earlier, which the decoder reads as a truncated save
		// rather than a valid one — so it is load-bearing for the offset even
		// though its value is not.
		const bytes = headerSave(0);
		const withoutTag = new Uint8Array([
			...bytes.subarray(0, CONTAINER_TAG_OFFSET),
			...bytes.subarray(CONTAINER_TAG_OFFSET + 1),
		]);
		await expect(decode(withoutTag)).rejects.toThrow();
	});
});

describe("the property-tag stream", () => {
	test("round-trips several tags and the closing None", async () => {
		const bytes = saveWith(2, 0, (le) => {
			intProperty(le, "Balance", 17);
			// An `StrProperty` carries no inner type name, so its `size` counts the
			// body minus the `hasGuid` byte: "Renée" is stored as UTF-16, five code
			// units at two bytes each plus a two-byte terminator.
			le.fString("Title")
				.fString("StrProperty")
				.i32(0)
				// The body is the one-byte hasGuid flag plus the FString's own
				// four-byte length and its twelve bytes of UTF-16, and `size`
				// counts all of that except the flag.
				.i32(4 + 5 * 2 + 2)
				.u8(0)
				.fString("Renée");
			intProperty(le, "Count", -7);
			le.fString("None");
		});
		expect(propertyNames(await decode(bytes))).toEqual([
			"Balance",
			"Title",
			"Count",
		]);
		expect(await rebuild(bytes)).toEqual(bytes);
	});

	test("preserves the trailing run that follows the closing None", async () => {
		// `PropertyList.trailing` exists because the bytes after `"None"` are not
		// always an int32 and are not part of the list. Carried verbatim is exact;
		// claimed as a length is a guess that happened to work on the first save.
		const bytes = saveWith(1, 0, (le) => {
			intProperty(le, "Balance", 17);
			le.fString("None");
			le.raw(new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00]));
		});
		expect(await rebuild(bytes)).toEqual(bytes);
	});

	test("a nested blob survives decode and encode unchanged", async () => {
		const { bytes, payload } = blobSave(4242);
		const save = await decode(bytes);
		expect(firstPropertyName(save)).toBe("SaveData");
		expect(firstPropertyType(save)).toBe("ArrayProperty");
		// Recognised as a decoded list, not left as fifty-odd opaque numbers.
		expect(firstArrayItemKinds(save)).toEqual(["blob"]);

		const rebuilt = await rebuild(bytes);
		expect(firstDifference(bytes, rebuilt)).toBeUndefined();
		expect(bytesEqual(bytes, rebuilt)).toBe(true);
		// The payload sits between the array's element count and the file's own
		// closing `"None"`, whose nine bytes are the only thing after it.
		const at = rebuilt.length - CLOSING_NONE - payload.length;
		expect(rebuilt.subarray(at, at + payload.length)).toEqual(payload);
	});

	test("keeps a byte array that is not a property list as bytes", async () => {
		// The other half of the blob rule, and the common case: most byte arrays
		// in a save are data. A decoder that decoded everything would corrupt
		// them, so this pins that they come back as numbers and re-encode alike.
		const payload = new Uint8Array([1, 2, 3, 250, 0, 128, 64]);
		const bytes = byteArraySave("Raw", payload);
		const save = await decode(bytes);
		expect(firstArrayItemKinds(save)).toEqual(
			Array.from({ length: payload.length }, () => "byte"),
		);
		expect(firstArrayItemBytes(save)).toEqual([...payload]);
		expect(await rebuild(bytes)).toEqual(bytes);
	});

	test("an edited leaf changes the bytes it names and nothing else", async () => {
		// The write path's purpose: an edit lands in the stream and the rest of the
		// file is untouched. Both values are four bytes, so every offset in the file
		// is unchanged and the diff is exactly the bytes that moved.
		const { bytes, valueAt } = blobSave(4242);
		const edited = bytes.slice();
		edited.set([0x39, 0x30, 0x00, 0x00], valueAt); // 12 345, little-endian
		// The bytes really were the value's, before and after.
		expect(bytes.subarray(valueAt, valueAt + 4)).toEqual(
			new Uint8Array([146, 16, 0, 0]),
		);
		expect(edited.subarray(valueAt, valueAt + 4)).toEqual(
			new Uint8Array([57, 48, 0, 0]),
		);
		expect(bytesEqual(bytes, edited)).toBe(false);
		// And the edited file re-encodes to itself, offsets and all.
		expect(await rebuild(edited)).toEqual(edited);
		// 4 242 is 0x00001092 and 12 345 is 0x00003039 little-endian, so the two low
		// bytes differ and the two already-zero high bytes do not: the edit moved two
		// bytes of the file and left every offset in place.
		const differing = [...bytes]
			.map((byte, index) => (byte === edited[index] ? -1 : index))
			.filter((index) => index >= 0);
		expect(differing).toEqual([valueAt, valueAt + 1]);
	});
});
