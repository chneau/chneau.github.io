/**
 * The CERIMAL byte layer, on its own terms: the reader and writer paired
 * against each other, and the format's own three accessors — the 7-bit integer,
 * the one-byte-length member name and the 7-bit-length type name.
 *
 * `tests/format.test.ts` reaches all of this only through a real `.dat` file,
 * which lives outside this repository — so on a machine without it every one of
 * those tests skips and the write path has no coverage at all. These tests pin
 * the bytes themselves: which of them a value is written in, what happens at
 * the boundaries of the variable-length integer, and that a member name is
 * measured in bytes rather than characters. The last group builds a document
 * through `document-fixture.ts` and puts it back through the same writer, so the
 * tag layer (`nodes.ts`) is exercised over a graph whose shape is known exactly:
 * a null, a value referred to twice through the back-reference table, and a
 * two-dimensional array.
 */
import { describe, expect, test } from "bun:test";
import { base64Encode, isJsonObject } from "../../shared";
import {
	CerimalReader,
	CerimalWriter,
	formatGuid,
	parseGuid,
} from "../lib/byte-reader";
import { MAGIC, readDocument, writeDocument } from "../lib/nodes";
import { documentData, encodeTestDocument } from "./document-fixture";

/** The bytes a writer produced, as plain numbers so a failure reads as hex. */
const written = (writer: CerimalWriter): readonly number[] => [
	...writer.finish(),
];

describe("the 7-bit integer", () => {
	/**
	 * The boundaries, not a sample: 127 is where the encoding grows a second
	 * byte, 2 147 483 647 is where it stops growing, and each power of two
	 * between them is a length, a count or an array extent that a real save
	 * reaches.
	 */
	const BOUNDARIES = [
		0, 1, 2, 126, 127, 128, 129, 255, 256, 16383, 16384, 2_097_151, 2_097_152,
		268_435_455, 268_435_456,
	];

	test("every boundary comes back as it went out", () => {
		const writer = new CerimalWriter(64);
		for (const value of BOUNDARIES) writer.sevenBit(value);
		const reader = new CerimalReader(writer.finish());
		for (const value of BOUNDARIES) {
			expect(reader.sevenBit()).toBe(value);
		}
		// And the buffer was consumed exactly, which is what "framed" means: a
		// reader that read one byte too few would still pass the values above.
		expect(reader.remaining).toBe(0);
	});

	test("one byte below two thousand, two bytes at it", () => {
		const writer = new CerimalWriter(8);
		writer.sevenBit(127).sevenBit(128);
		expect(written(writer)).toEqual([0x7f, 0x80, 0x01]);
	});

	test("a length longer than the format allows is refused", () => {
		// Six continuation bytes: the fifth payload byte would sit at bit 28 and
		// the sixth past the end of a 32-bit word, so the value cannot be read
		// back as written.
		const reader = new CerimalReader(
			new Uint8Array([0x80, 0x80, 0x80, 0x80, 0x80, 0x01]),
		);
		expect(() => reader.sevenBit("a count")).toThrow(
			/a count is longer than this format allows/,
		);
	});

	test("a length that runs off the end of the buffer is refused", () => {
		expect(() => new CerimalReader(new Uint8Array([0x80])).sevenBit()).toThrow(
			/Truncated save/,
		);
	});

	test("a count above 2^31 comes back signed, which is the bit pattern's fault", () => {
		// Neither half has a range check, so a count larger than the format can
		// hold is written and read rather than refused — and the fifth payload
		// byte lands on bit 28, so what comes back is a negative number. Pinned
		// because a caller that loops `while (count-- > 0)` on the result would
		// not loop at all, and nothing throws to say why.
		const writer = new CerimalWriter(8);
		writer.sevenBit(-1);
		const read = new CerimalReader(writer.finish()).sevenBit();
		expect(read).toBe(-1);
		expect(read >>> 0).toBe(4_294_967_295);
	});
});

describe("member names and type names", () => {
	test("a name is its own length and its own bytes", () => {
		const writer = new CerimalWriter(64);
		writer.name("Gold");
		expect(written(writer)).toEqual([4, 0x47, 0x6f, 0x6c, 0x64]);
		expect(new CerimalReader(writer.finish()).name()).toBe("Gold");
	});

	test("an empty name is a zero and nothing else", () => {
		const writer = new CerimalWriter(8);
		writer.name("");
		expect(written(writer)).toEqual([0]);
		expect(new CerimalReader(writer.finish()).name()).toBe("");
	});

	test("a name is measured in bytes, not in characters", () => {
		// Each of these is 128 characters and 256 bytes, which one length byte
		// cannot describe. A writer that counted characters would write a name
		// that reads back as half of itself.
		const wide = "é".repeat(128);
		expect(new TextEncoder().encode(wide).length).toBe(256);
		expect(() => new CerimalWriter(8).name(wide)).toThrow(
			/A CERIMAL member name is one length byte long/,
		);
		// The longest name the format can hold is 255 bytes, and it survives.
		const longest = "a".repeat(255);
		expect(
			new CerimalReader(new CerimalWriter(300).name(longest).finish()).name(),
		).toBe(longest);
	});

	test("a type name's length rides in the 7-bit integer", () => {
		// 300 bytes: two length bytes, where a member name would have thrown.
		const name = "Quantum.SomeVeryLongTypeName".repeat(11).slice(0, 300);
		const writer = new CerimalWriter(512);
		writer.sevenBitName(name);
		const bytes = written(writer);
		expect(bytes[0]).toBe((300 & 0x7f) | 0x80);
		expect(bytes[1]).toBe(300 >>> 7);
		expect(new CerimalReader(writer.finish()).sevenBitName()).toBe(name);
	});

	test("a name that runs off the end of the buffer is refused", () => {
		// A length byte promising eight bytes with only three there: the failure
		// a truncated save must name rather than decode to a partial name.
		expect(() =>
			new CerimalReader(new Uint8Array([8, 1, 2, 3])).name(),
		).toThrow(/Truncated save/);
	});
});

/** One member of the little graph the reader and writer are paired over. */
type Member = {
	readonly index: number;
	readonly name: string;
	readonly typeName: string;
};

/** The graph: a fixed width count, then names of both lengths and a raw run. */
const MEMBERS: readonly Member[] = [
	{ index: 0, name: "", typeName: "Quantum.GameSaveData" },
	{ index: 1, name: "Ünïcodé", typeName: "Quantum.PlayerSerializedData" },
	{ index: 12_345, name: "Attributes", typeName: "x".repeat(300) },
];

describe("a small object graph through the writer and back", () => {
	const write = (): Uint8Array => {
		const writer = new CerimalWriter(16);
		writer.sevenBit(MEMBERS.length);
		for (const member of MEMBERS) {
			writer.sevenBit(member.index);
			writer.name(member.name);
			writer.sevenBitName(member.typeName);
		}
		// A trailing run of raw bytes, so the framing is checked against
		// something the accessors did not write.
		writer.raw(new Uint8Array([0x00, 0xff, 0x10]));
		return writer.finish();
	};

	test("every field comes back as it went out", () => {
		const reader = new CerimalReader(write());
		const read = reader.sevenBit();
		const members: Member[] = [];
		for (let index = 0; index < read; index += 1) {
			members.push({
				index: reader.sevenBit(),
				name: reader.name("a member name"),
				typeName: reader.sevenBitName("a type name"),
			});
		}
		expect(members).toEqual([...MEMBERS]);
		// Exactly the three raw bytes are left: no accessor over-read, and the
		// writer's growth from a 16-byte buffer to 512 wrote nothing but values.
		expect([...reader.raw(3, "a trailing run")]).toEqual([0x00, 0xff, 0x10]);
		expect(reader.done).toBe(true);
	});

	test("the writer grew from sixteen bytes without losing a byte", () => {
		// Every `sevenBit`/`name`/`sevenBitName` returned the writer, so the calls
		// chain; a chain that stopped early would leave the graph short.
		const length = write().length;
		const writer = new CerimalWriter(16);
		for (const member of MEMBERS) {
			writer
				.sevenBit(member.index)
				.name(member.name)
				.sevenBitName(member.typeName);
		}
		expect(writer.length).toBe(length - 1 - 3);
	});
});

describe("the little-endian base the format shares", () => {
	test("a wide value is stored least significant byte first", () => {
		const writer = new CerimalWriter(8);
		writer.u32(0x01020304);
		expect(written(writer)).toEqual([0x04, 0x03, 0x02, 0x01]);
		const doubles = new CerimalWriter(8);
		doubles.f64(1);
		expect(written(doubles)).toEqual([
			0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf0, 0x3f,
		]);
	});

	test("and a reader with an odd start reads from that start", () => {
		const writer = new CerimalWriter(16);
		writer.u8(0xff).u8(0xff).u32(2447).i64(-2n);
		const reader = new CerimalReader(writer.finish(), 2);
		expect(reader.u32("a revision")).toBe(2447);
		expect(reader.i64("a counter")).toBe(-2n);
		expect(reader.done).toBe(true);
	});
});

describe("GUIDs", () => {
	test("the first three groups are mixed-endian, as .NET stores them", () => {
		const bytes = parseGuid("01020304-0506-0708-090a-0b0c0d0e0f10");
		expect([...bytes]).toEqual([
			0x04, 0x03, 0x02, 0x01, 0x06, 0x05, 0x08, 0x07, 0x09, 0x0a, 0x0b, 0x0c,
			0x0d, 0x0e, 0x0f, 0x10,
		]);
		expect(formatGuid(bytes)).toBe("01020304-0506-0708-090a-0b0c0d0e0f10");
	});

	test("a borrowed view is formatted from its own offset", () => {
		// The reader hands GUIDs out with `borrow`, so the sixteen bytes live
		// inside the document's buffer rather than in a fresh array. A `DataView`
		// over the whole buffer would print the two bytes before it.
		const buffer = new Uint8Array(24);
		buffer.set(parseGuid("deadbeef-1111-2222-3333-444444444444"), 4);
		expect(formatGuid(buffer.subarray(4, 20))).toBe(
			"deadbeef-1111-2222-3333-444444444444",
		);
	});

	test("every printed group is padded to its width", () => {
		expect(formatGuid(new Uint8Array(16))).toBe(
			"00000000-0000-0000-0000-000000000000",
		);
	});

	test("text that is not a GUID is refused", () => {
		for (const bad of [
			"not-a-guid",
			"01020304-0506-0708-090a-0b0c0d0e0f10-extra",
			"01020304-0506-0708-090a-0b0c0d0e0fzz",
			"1020304-0506-0708-090a-0b0c0d0e0f10",
			"01020304-0506-0708-090a-0b0c0d0e0f1",
		]) {
			expect(() => parseGuid(bad)).toThrow(/is not a GUID/);
		}
	});
});

describe("a document built from the fixture, read back", () => {
	/** Past the magic, which `decodeSave` consumes and `readDocument` does not. */
	const afterMagic = (bytes: Uint8Array): CerimalReader =>
		new CerimalReader(bytes, MAGIC.length);

	// Versions 2 and 3 differ only in the compression word, and the writer only
	// emits that word for the version that has it.
	for (const version of [2, 3]) {
		test(`version ${version} comes back as it went out`, () => {
			const bytes = encodeTestDocument(version);
			const decoded = readDocument(afterMagic(bytes), bytes);
			expect(decoded.header.version).toBe(version);
			expect(decoded.header.compression).toBe(0);
			expect(decoded.rootType).toBe("TestRoot");
			expect(decoded.schema.definitions.map((one) => one.name)).toEqual([
				"TestRoot",
				"TestItem",
			]);
			expect(decoded.data).toEqual(documentData());
			// The header's two lengths describe the two runs it declares, which is
			// the only thing that makes the checksum's range the right one.
			expect(decoded.header.schemaSize).toBeGreaterThan(0);
			expect(decoded.header.contentSize).toBeGreaterThan(0);
		});
	}

	test("a value referred to twice is one object, not two equal ones", () => {
		const bytes = encodeTestDocument();
		const decoded = readDocument(afterMagic(bytes), bytes);
		if (!isJsonObject(decoded.data))
			throw new Error("the root is not a record.");
		// The back-reference table is what makes this the same instance, and the
		// re-encoder recognises a back-reference by exactly that identity — so a
		// reader that cloned would turn a 1.7 MB realm save into a deep tree and
		// rebuild it larger than the file it came from.
		expect(decoded.data.Alias).toBe(decoded.data.Item);
		expect(decoded.data.Item).toEqual({ Label: "a shared label" });
		expect(decoded.registered).toEqual([["Item"]]);
	});

	test("a null node is a zero tag and nothing else", () => {
		const bytes = encodeTestDocument();
		const decoded = readDocument(afterMagic(bytes), bytes);
		if (!isJsonObject(decoded.data))
			throw new Error("the root is not a record.");
		expect(decoded.data.Nothing).toBeNull();
		// Absent is not the same as null: a field the schema declares is read
		// either way, and only one of them is written back as the null tag.
		expect("Nothing" in decoded.data).toBe(true);
	});

	test("a rank-two array keeps the extents the file recorded", () => {
		const bytes = encodeTestDocument();
		const decoded = readDocument(afterMagic(bytes), bytes);
		if (!isJsonObject(decoded.data))
			throw new Error("the root is not a record.");
		// Flattened on the way in — six elements, no shape — and the shape is
		// carried beside the document, because `[2,3]` and `[6,1,1]` hold the same
		// six elements and only the file knows which it meant.
		expect(decoded.data.Grid).toEqual([1, 2, 3, 4, 5, 6]);
		expect(decoded.dimensions).toEqual([[["Grid"], [2, 3]]]);
	});

	test("writing what was read reproduces the very same bytes", () => {
		const bytes = encodeTestDocument();
		const decoded = readDocument(afterMagic(bytes), bytes);
		const again = new CerimalWriter(256);
		writeDocument(again, {
			rootType: decoded.rootType,
			version: decoded.header.version,
			compression: decoded.header.compression,
			schema: base64Encode(decoded.schemaBytes),
			registered: decoded.registered,
			dimensions: decoded.dimensions,
			data: decoded.data,
		});
		expect(written(again)).toEqual([...bytes]);
	});

	test("a document whose content does not hash to its claim is refused", () => {
		const bytes = encodeTestDocument();
		// The last byte of the payload, so the header still parses.
		bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 0xff;
		expect(() => readDocument(afterMagic(bytes), bytes)).toThrow(/is damaged/);
	});
});
