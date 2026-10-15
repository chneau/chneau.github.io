import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	applyEdits,
	type Bytes,
	getAtPath,
	type JsonValue,
	verifyRoundTrip,
} from "../../shared";
import {
	type CerimalFile,
	decodeSave,
	encodeSave,
	noRestForTheWicked,
} from "../lib/format";
import { hex64, xxHash64 } from "../lib/xxhash";

const FIXTURES = join(
	import.meta.dir,
	"..",
	"..",
	"..",
	"..",
	"testing",
	"testing-decrypt-no-rest-for-the-wicked-savegame",
	"backup_steamdeck_datastore",
	"DataStore",
);

const fixtureFiles = (): readonly string[] => {
	if (!existsSync(FIXTURES)) return [];
	const found: string[] = [];
	for (const revision of ["22950", "23939"]) {
		const directory = join(FIXTURES, revision);
		if (!existsSync(directory)) continue;
		for (const name of readdirSync(directory)) {
			if (name.endsWith(".dat")) found.push(join(directory, name));
		}
	}
	const settings = join(FIXTURES, "AccountSettings_LOCAL.dat");
	if (existsSync(settings)) found.push(settings);
	return found.sort();
};

const readFixture = (path: string): Bytes => new Uint8Array(readFileSync(path));

const readText = (path: string): string =>
	new TextDecoder().decode(readFixture(path));

const CHARACTER = join(
	FIXTURES,
	"22950",
	"Character_937acfcb-2145-4c0d-8f33-6f482f984e83.dat",
);

const toBase64 = (bytes: Uint8Array): string => {
	let binary = "";
	for (let at = 0; at < bytes.length; at += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
	}
	return btoa(binary);
};

const fromBase64 = (text: string): Uint8Array => {
	const binary = atob(text);
	const out = new Uint8Array(binary.length);
	for (const [index, character] of [...binary].entries()) {
		out[index] = character.charCodeAt(0);
	}
	return out;
};

const hashedRegion = (
	text: string,
): { readonly body: Uint8Array; readonly stored: bigint } | null => {
	const envelope = JSON.parse(text) as { binaryInfo?: string };
	if (typeof envelope.binaryInfo !== "string") return null;
	const stream = fromBase64(envelope.binaryInfo);
	const view = new DataView(
		stream.buffer,
		stream.byteOffset,
		stream.byteLength,
	);
	const schemaSize = view.getUint32(8, true);
	const contentSize = view.getUint32(12, true);
	return {
		body: stream.subarray(24, 24 + schemaSize + contentSize),
		stored: view.getBigUint64(16, true),
	};
};

describe("xxHash64", () => {
	test("matches the published vectors", () => {
		const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
		expect(hex64(xxHash64(bytes("")))).toBe("ef46db3751d8e999");
		expect(hex64(xxHash64(bytes("a")))).toBe("d24ec4f1a98c6e5b");
		expect(hex64(xxHash64(bytes("abc")))).toBe("44bc2cf5ad770999");
		expect(hex64(xxHash64(bytes("this is a test"), 0xcafen))).toBe(
			"4228c3215949e862",
		);
	});

	test("is a function of its input, and of nothing else", () => {
		const one = new Uint8Array([1, 2, 3]);
		const two = new Uint8Array([1, 2, 3]);
		expect(xxHash64(one)).toBe(xxHash64(two));
		expect(xxHash64(new Uint8Array([1, 2, 4]))).not.toBe(xxHash64(one));
		expect(xxHash64(one, 1n)).not.toBe(xxHash64(one));
		expect(hex64(xxHash64(one, 1n))).toHaveLength(16);
	});
});

describe("the CERIMAL codec", () => {
	test("says what it is", () => {
		expect(noRestForTheWicked.extensions).toEqual(["dat"]);
		expect(noRestForTheWicked.notes.length).toBeGreaterThanOrEqual(3);
		expect(noRestForTheWicked.notes.length).toBeLessThanOrEqual(4);
		expect(noRestForTheWicked.defaultPath).toContain("NoRestForTheWicked");
		expect(noRestForTheWicked.formatLabel).toContain("CERIMAL");
	});

	test("refuses a file that is not a save", async () => {
		await expect(
			decodeSave(new TextEncoder().encode("not a save at all")),
		).rejects.toThrow(/does not parse as JSON/);
	});

	test("refuses JSON that is not a save", async () => {
		await expect(
			decodeSave(new TextEncoder().encode("[1,2,3]")),
		).rejects.toThrow(/not a JSON object/);
	});

	test("refuses a payload that is not CERIMAL", async () => {
		const text = '{"id":"1","binaryInfo":"AAAAAAAAAAAA"}';
		await expect(decodeSave(new TextEncoder().encode(text))).rejects.toThrow(
			/not a CERIMAL document/,
		);
	});
});

const fixtures = fixtureFiles();

describe.skipIf(fixtures.length === 0)("real saves", () => {
	for (const file of fixtures) {
		const name = file.slice(FIXTURES.length + 1).replaceAll("\\", "/");

		test(`round-trips ${name} byte for byte`, async () => {
			const original = readFixture(file);
			const document = await decodeSave(original);
			const rebuilt = await encodeSave(document);
			expect(rebuilt.length).toBe(original.length);
			expect([...rebuilt]).toEqual([...original]);
		});

		test(`verifies the checksum in ${name}`, async () => {
			await expect(decodeSave(readFixture(file))).resolves.toBeDefined();
			const region = hashedRegion(readText(file));
			if (region === null) return;
			expect(hex64(xxHash64(region.body))).toBe(hex64(region.stored));
		});
	}

	test("the checksum covers the schema and the payload together", () => {
		const region = hashedRegion(readText(CHARACTER));
		if (region === null) throw new Error("This save has no CERIMAL payload.");
		expect(hex64(xxHash64(region.body))).toBe(hex64(region.stored));
		expect(
			hex64(xxHash64(region.body.subarray(region.body.length - 100))),
		).not.toBe(hex64(region.stored));
	});

	test("a damaged payload is refused rather than half-read", async () => {
		const text = readText(CHARACTER);
		const envelope = JSON.parse(text) as { binaryInfo: string };
		const stream = fromBase64(envelope.binaryInfo);
		stream[stream.length - 1] = (stream[stream.length - 1] ?? 0) ^ 0xff;
		const damaged = text.replace(envelope.binaryInfo, toBase64(stream));
		await expect(decodeSave(new TextEncoder().encode(damaged))).rejects.toThrow(
			/damaged/,
		);
	});

	test("a damaged schema is refused too", async () => {
		const text = readText(CHARACTER);
		const envelope = JSON.parse(text) as { binaryInfo: string };
		const stream = fromBase64(envelope.binaryInfo);
		stream[40] = (stream[40] ?? 0) ^ 0x01;
		const damaged = text.replace(envelope.binaryInfo, toBase64(stream));
		await expect(decodeSave(new TextEncoder().encode(damaged))).rejects.toThrow(
			/damaged/,
		);
	});

	test("a truncated payload is refused", async () => {
		const text = readText(CHARACTER);
		const envelope = JSON.parse(text) as { binaryInfo: string };
		const stream = fromBase64(envelope.binaryInfo);
		const truncated = stream.subarray(0, stream.length - 64);
		await expect(
			decodeSave(
				new TextEncoder().encode(
					text.replace(envelope.binaryInfo, toBase64(truncated)),
				),
			),
		).rejects.toThrow();
	});

	test("the decoded document names the game's own fields", async () => {
		const document = await decodeSave(readFixture(CHARACTER));
		const envelope = document.$cerimal.envelope;
		expect(envelope.name).toBe("Charles");
		expect(envelope.revision).toBe(2447);
		expect(typeof envelope.updatedAt).toBe("string");
		const info = envelope.info;
		expect(typeof info).toBe("object");

		const view = document.$cerimal.documents[0];
		expect(view?.rootType).toBe("Quantum.PlayerSerializedData");
		expect(view?.version).toBe(2);
		const data = view?.data;
		expect(typeof data).toBe("object");
		const player = data as { readonly [key: string]: JsonValue };
		expect(typeof player.Gold).toBe("number");
		expect(typeof player.Level).toBe("number");
		expect(typeof player.CrucibleCurrency).toBe("number");
		expect(typeof player.IsHardcore).toBe("boolean");
		expect(typeof player.TimePlayed).toBe("number");
		const attributes = player.Attributes;
		expect(typeof attributes).toBe("object");
		const dictionary = Object.values(
			attributes as { [key: string]: JsonValue },
		)[0];
		expect(Array.isArray(dictionary)).toBe(true);
		const keys = (dictionary as readonly { key?: string }[]).map(
			(entry) => entry.key,
		);
		expect(keys).toContain("Health");
		expect(keys).toContain("Stamina");
	});

	test("a save with no payload is a plain JSON document", async () => {
		const account = join(FIXTURES, "22950", "Account_76561198016420457.dat");
		const original = readFixture(account);
		const document = await decodeSave(original);
		expect(document.$cerimal.documents).toHaveLength(0);
		expect(document.$cerimal.wrapperAfter).toBe("");
		expect(document.$cerimal.envelope.binaryInfo).toBeNull();
		expect([...(await encodeSave(document))]).toEqual([...original]);
	});

	test("an edited envelope is written back, not spliced", async () => {
		const document = await decodeSave(readFixture(CHARACTER));
		const edited: CerimalFile = {
			$cerimal: {
				...document.$cerimal,
				envelope: { ...document.$cerimal.envelope, name: "Wilhelmina" },
			},
		};
		const text = new TextDecoder().decode(await encodeSave(edited));
		expect(text).toContain('"name":"Wilhelmina"');
		expect(text).not.toContain("1748808466.0");
		const reread = await decodeSave(new TextEncoder().encode(text));
		expect(reread.$cerimal.envelope.name).toBe("Wilhelmina");
		expect(reread.$cerimal.documents[0]?.rootType).toBe(
			"Quantum.PlayerSerializedData",
		);
		expect(readText(CHARACTER)).toContain("1748808466.0");
	});

	test("the workbench's own proof says an untouched save is identical", async () => {
		const original = readFixture(CHARACTER);
		const document = await decodeSave(original);
		const verdict = await verifyRoundTrip(
			noRestForTheWicked,
			original,
			document,
			false,
		);
		expect(verdict).toEqual({ kind: "identical" });
	});

	test("an edit is rebuilt, read back, and reported as a change", async () => {
		const original = readFixture(CHARACTER);
		const document = await decodeSave(original);
		const fill = noRestForTheWicked.actions[0];
		const planned = fill?.plan(document) ?? [];
		expect(planned).toHaveLength(1);
		const edited = applyEdits(document, planned);
		const verdict = await verifyRoundTrip(
			noRestForTheWicked,
			original,
			edited,
			true,
		);
		expect(verdict.kind).toBe("semantic");
		const rebuilt = await encodeSave(edited);
		const reread = await decodeSave(rebuilt);
		const data = reread.$cerimal.documents[0]?.data as { Gold?: number };
		const gold = data?.Gold;
		expect(planned[0]?.after).toBe(9_999_999);
		expect(gold).toBe(9_999_999);
	});
});

describe.skipIf(fixtures.length === 0)("quick changes", () => {
	test("plan changes nothing and always plans the same thing", async () => {
		const document = await decodeSave(readFixture(CHARACTER));
		const before = JSON.stringify(document);
		for (const action of noRestForTheWicked.actions) {
			const first = action.plan(document);
			const second = action.plan(document);
			expect(second).toEqual(first);
			expect(JSON.stringify(document)).toBe(before);
		}
	});

	test("every action names a path the save really has", async () => {
		const document = await decodeSave(readFixture(CHARACTER));
		let planned = 0;
		for (const action of noRestForTheWicked.actions) {
			for (const edit of action.plan(document)) {
				planned += 1;
				expect(getAtPath(document, edit.path)).toEqual(edit.before);
				expect(edit.before).not.toEqual(edit.after);
			}
		}
		expect(planned).toBe(4);
	});

	test("an action that has nothing to do greys itself out", async () => {
		const realm = join(
			FIXTURES,
			"22950",
			"Realm_57b8b5ea-11f4-42ca-bd18-8721c6746167.dat",
		);
		const document = await decodeSave(readFixture(realm));
		for (const action of noRestForTheWicked.actions) {
			expect(action.plan(document)).toHaveLength(0);
		}
	});

	test("hardcore mode is only offered when it is on", async () => {
		const document = await decodeSave(readFixture(CHARACTER));
		const action = noRestForTheWicked.actions.find(
			(candidate) => candidate.id === "leave-hardcore",
		);
		expect(action?.plan(document)).toHaveLength(0);
	});
});
