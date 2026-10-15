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

const PROPERTY_LIST_OFFSET = 1804;

const CONTAINER_TAG_OFFSET = 1803;

const CLOSING_NONE = 9;

const CLASS_NAME = "/Script/PixelsplitSaveSystem.PixelSaveGame";
const BRANCH = "++UE5+Release-5.7";

const REAL_GUIDS = [
	"9c54d522-a826-4fbe-9421-074661b482d0",
	"fa2e1ad1-8a1e-4b1f-b1b9-3a2b8f9a2c31",
	"b3c4d5e6-f708-4192-8a3b-9c4d5e6f7081",
] as const;

const customVersions = (
	count: number,
): readonly { id: string; version: number }[] =>
	Array.from({ length: count }, (_unused, index) => {
		const hex = index.toString(16).padStart(12, "0");
		const id = REAL_GUIDS[index] ?? `f7084192-8a3b-4c5d-${hex}-e6f7081a2b3c`;
		return { id, version: 1000 + index };
	});

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

const intProperty = (le: Le, name: string, value: number, bodySize = 4): Le =>
	le.fString(name).fString("IntProperty").i32(0).i32(bodySize).u8(0).i32(value);

const saveWith = (
	count: number,
	containerTag: number,
	list: (le: Le) => void,
): Bytes => {
	const le = new Le();
	le.raw(new TextEncoder().encode("GVAS"));
	le.i32(3);
	le.i32(522);
	le.i32(1018);
	le.u16(5);
	le.u16(7);
	le.u16(4);
	le.u32(51_494_982);
	le.fString(BRANCH);
	le.i32(3);
	le.i32(count);
	for (const custom of customVersions(count))
		le.guid(custom.id).i32(custom.version);
	le.fString(CLASS_NAME);
	le.u8(containerTag);
	list(le);
	return le.build();
};

const headerSave = (containerTag = 0): Bytes =>
	saveWith(85, containerTag, (le) => {
		intProperty(le, "Balance", 17);
		le.fString("None");
	});

const byteArraySave = (name: string, payload: Bytes): Bytes =>
	saveWith(1, 0, (le) => {
		le.fString(name)
			.fString("ArrayProperty")
			.i32(0)
			.i32(13)
			.raw(new TextEncoder().encode("ByteProperty\u0000"))
			.i32(0)
			.i32(4 + payload.length)
			.u8(0)
			.i32(payload.length)
			.raw(payload);
		le.fString("None");
	});

const blobSave = (
	balance: number,
): {
	readonly bytes: Bytes;
	readonly payload: Bytes;
	readonly valueAt: number;
} => {
	const inner = new Le();
	inner.u8(2);
	intProperty(inner, "Balance", balance);
	inner.fString("None");
	const payload = inner.build();
	const bytes = byteArraySave("SaveData", payload);
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

const propertiesOf = (
	doc: JsonValue,
): readonly { readonly [key: string]: JsonValue }[] =>
	requireArrayAt(requireObjectAt(doc, "list"), "properties").map((tag) => {
		if (!isJsonObject(tag)) {
			throw new Error("a property tag is not an object.");
		}
		return tag;
	});

const firstPropertyOf = (
	doc: JsonValue,
): { readonly [key: string]: JsonValue } => {
	const first = propertiesOf(doc)[0];
	if (first === undefined) throw new Error("the save has no properties.");
	return first;
};

const firstArrayItemKinds = (doc: JsonValue): readonly string[] =>
	requireArrayAt(requireObjectAt(firstPropertyOf(doc), "value"), "items").map(
		(item) => requireStringAt(item, "kind"),
	);

const firstArrayItemBytes = (doc: JsonValue): readonly number[] =>
	requireArrayAt(requireObjectAt(firstPropertyOf(doc), "value"), "items").map(
		(item) => requireNumberAt(item, "value"),
	);

const firstPropertyName = (doc: JsonValue): string =>
	requireStringAt(firstPropertyOf(doc), "name");

const firstPropertyType = (doc: JsonValue): string =>
	requireStringAt(requireObjectAt(firstPropertyOf(doc), "value"), "type");

const propertyNames = (doc: JsonValue): readonly string[] =>
	propertiesOf(doc).map((tag) => requireStringAt(tag, "name"));

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
		expect(bytes[CONTAINER_TAG_OFFSET]).toBe(0);
		expect([
			...bytes.subarray(PROPERTY_LIST_OFFSET, PROPERTY_LIST_OFFSET + 4),
		]).toEqual([8, 0, 0, 0]);
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
		const bytes = headerSave();
		const rebuilt = await rebuild(bytes);
		expect(firstDifference(bytes, rebuilt)).toBeUndefined();
		expect(rebuilt).toHaveLength(bytes.length);
		expect(rebuilt.subarray(56, 56 + 85 * 20)).toEqual(
			bytes.subarray(56, 56 + 85 * 20),
		);
	});

	test("keeps the count field and the table in step when they disagree", async () => {
		const bytes = saveWith(4, 0, (le) => {
			intProperty(le, "Balance", 17);
			le.fString("None");
		});
		expect(customVersionsOf(await decode(bytes))).toHaveLength(4);
		expect(await rebuild(bytes)).toEqual(bytes);
	});

	test("refuses a custom-version count the remaining bytes cannot hold", async () => {
		const bytes = headerSave();
		const tampered = bytes.slice();
		tampered.set([0xff, 0xff, 0xff, 0x7f], 52);
		await expect(decode(tampered)).rejects.toThrow(/custom versions/);
	});
});

describe("the unlabelled byte", () => {
	test("is carried through rather than assumed to be zero", async () => {
		const bytes = headerSave(0);
		const odd = headerSave(0x5a);
		expect(odd[CONTAINER_TAG_OFFSET]).toBe(0x5a);
		expect(await decode(odd)).toHaveProperty("containerTag", 0x5a);
		expect(await rebuild(odd)).toEqual(odd);
		expect(await rebuild(bytes)).toEqual(bytes);
	});

	test("is not the property list, and losing it would show", async () => {
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
			le.fString("Title")
				.fString("StrProperty")
				.i32(0)
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
		expect(firstArrayItemKinds(save)).toEqual(["blob"]);

		const rebuilt = await rebuild(bytes);
		expect(firstDifference(bytes, rebuilt)).toBeUndefined();
		expect(bytesEqual(bytes, rebuilt)).toBe(true);
		const at = rebuilt.length - CLOSING_NONE - payload.length;
		expect(rebuilt.subarray(at, at + payload.length)).toEqual(payload);
	});

	test("keeps a byte array that is not a property list as bytes", async () => {
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
		const { bytes, valueAt } = blobSave(4242);
		const edited = bytes.slice();
		edited.set([0x39, 0x30, 0x00, 0x00], valueAt);
		expect(bytes.subarray(valueAt, valueAt + 4)).toEqual(
			new Uint8Array([146, 16, 0, 0]),
		);
		expect(edited.subarray(valueAt, valueAt + 4)).toEqual(
			new Uint8Array([57, 48, 0, 0]),
		);
		expect(bytesEqual(bytes, edited)).toBe(false);
		expect(await rebuild(edited)).toEqual(edited);
		const differing = [...bytes]
			.map((byte, index) => (byte === edited[index] ? -1 : index))
			.filter((index) => index >= 0);
		expect(differing).toEqual([valueAt, valueAt + 1]);
	});
});
