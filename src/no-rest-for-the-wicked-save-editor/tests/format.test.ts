/**
 * The CERIMAL codec, held to the only thing that matters about a save format:
 * that an untouched save comes back byte for byte.
 *
 * The byte-exactness tests read real `.dat` files — Moon Studios' own, from the
 * save tool this codec was ported from — and they are the reason the writer
 * exists in the shape it does. They live outside this repository, at the path
 * below, so the suites that need one run where they are and are skipped, loudly,
 * where they are not; everything that does not need a real save always runs.
 *
 * Every one of them is asserted, on every run, rather than a sample: the format
 * has a dozen corners that only some files reach — a struct with padding, a
 * runtime type override, a value referred to sixteen thousand times — and a
 * subset would pass while a corner stayed broken.
 */
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

/**
 * Real saves, relative to this file: `src/<app>/tests/` is three directories
 * below the repository root, and the original tool's backup DataStore sits
 * beside it rather than inside the site.
 */
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

/** Every `.dat` in that tree, in a stable order, or none of them if it is not here. */
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

/**
 * A fixture's bytes, as the codec's own `Bytes`.
 *
 * `readFileSync` hands back a Node buffer, which the type system treats as
 * possibly shared memory; the codec takes a plain `ArrayBuffer` because that is
 * what WebCrypto and `CompressionStream` accept. Copying once here says so in
 * one place instead of at every call site.
 */
const readFixture = (path: string): Bytes => new Uint8Array(readFileSync(path));

const readText = (path: string): string =>
	new TextDecoder().decode(readFixture(path));

/** The character save: the one with a player in it, and the smallest with one. */
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

/**
 * The region a document's checksum covers, and the checksum it claims.
 *
 * That region is the schema and the payload as one run, which is how they sit
 * in the file: the header names their two lengths, and everything from the end
 * of the checksum field to the end of the payload is what was hashed.
 */
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
	// Published XXH64 values: the empty string, one byte and three bytes are
	// the vectors the xxHash documentation quotes, and the seeded one is the
	// worked example in a published Go implementation's package docs. Together
	// they exercise the whole algorithm — the fourteen-byte seeded case is long
	// enough to need the 32-byte accumulator loop *and* the overlapping tail —
	// and the real saves below pin the same code over megabytes.
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
		// A seed changes the result but not the length of the digest.
		expect(hex64(xxHash64(one, 1n))).toHaveLength(16);
	});
});

describe("the CERIMAL codec", () => {
	test("says what it is", () => {
		expect(noRestForTheWicked.id).toBe("no-rest-for-the-wicked-save-editor");
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
			// The round trip the page promises: the same bytes, not merely an
			// equivalent file. Anything less and the verdict it shows the user is
			// decoration.
			const rebuilt = await encodeSave(document);
			expect(rebuilt.length).toBe(original.length);
			expect([...rebuilt]).toEqual([...original]);
		});

		test(`verifies the checksum in ${name}`, async () => {
			// Reading the file at all proves the header's xxHash64 was checked:
			// `decode` refuses a document whose schema and content do not hash to
			// what it claims, and the tests below show it refusing. Where there
			// is a payload the claim is checked a second time, from the outside,
			// so this is not the codec agreeing with itself.
			await expect(decodeSave(readFixture(file))).resolves.toBeDefined();
			// An account or settings save has no payload and no checksum to
			// check, which is the only reason this is allowed to return early.
			const region = hashedRegion(readText(file));
			if (region === null) return;
			expect(hex64(xxHash64(region.body))).toBe(hex64(region.stored));
		});
	}

	test("the checksum covers the schema and the payload together", () => {
		const region = hashedRegion(readText(CHARACTER));
		if (region === null) throw new Error("This save has no CERIMAL payload.");
		expect(hex64(xxHash64(region.body))).toBe(hex64(region.stored));
		// And not the payload alone, which is the mistake a checksum range
		// invites: a range that reads back correctly for the last hundred bytes
		// and nothing else would still pass a weaker test than this one.
		expect(
			hex64(xxHash64(region.body.subarray(region.body.length - 100))),
		).not.toBe(hex64(region.stored));
	});

	test("a damaged payload is refused rather than half-read", async () => {
		const text = readText(CHARACTER);
		const envelope = JSON.parse(text) as { binaryInfo: string };
		const stream = fromBase64(envelope.binaryInfo);
		// The last byte of the payload, so the header still parses and only the
		// content is wrong.
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
		// Inside the schema, which begins at byte 24.
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
		// The envelope is the game's JSON, read out under its own key names.
		expect(envelope.name).toBe("Charles");
		expect(envelope.revision).toBe(2447);
		expect(typeof envelope.updatedAt).toBe("string");
		const info = envelope.info;
		expect(typeof info).toBe("object");

		const view = document.$cerimal.documents[0];
		expect(view?.rootType).toBe("Quantum.PlayerSerializedData");
		expect(view?.version).toBe(2);
		// Every one of these is a field the game's schema declares, and the
		// quick actions below address them by these names.
		const data = view?.data;
		expect(typeof data).toBe("object");
		const player = data as { readonly [key: string]: JsonValue };
		expect(typeof player.Gold).toBe("number");
		expect(typeof player.Level).toBe("number");
		expect(typeof player.CrucibleCurrency).toBe("number");
		expect(typeof player.IsHardcore).toBe("boolean");
		expect(typeof player.TimePlayed).toBe("number");
		// A dictionary is stored under the position it was declared at.
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
		// It has a binaryInfo, and it is null: that is what tells a plain save
		// apart from one that carries a CERIMAL stream.
		expect(document.$cerimal.envelope.binaryInfo).toBeNull();
		expect([...(await encodeSave(document))]).toEqual([...original]);
	});

	test("an edited envelope is written back, not spliced", async () => {
		const document = await decodeSave(readFixture(CHARACTER));
		// A copy of the envelope, with the character's name changed. The
		// documents themselves are shared rather than cloned, because the
		// back-reference table in them is keyed by object identity and a deep
		// copy would quietly break the sharing the rebuild depends on.
		const edited: CerimalFile = {
			$cerimal: {
				...document.$cerimal,
				envelope: { ...document.$cerimal.envelope, name: "Wilhelmina" },
			},
		};
		const text = new TextDecoder().decode(await encodeSave(edited));
		expect(text).toContain('"name":"Wilhelmina"');
		// An edited envelope can no longer be spliced into the original text, so
		// the file is re-serialised — which is what costs the game its own
		// number formatting, and is the trade this branch exists to make.
		expect(text).not.toContain("1748808466.0");
		// The payload is still there, and still readable: an envelope edit must
		// not cost the user their character.
		const reread = await decodeSave(new TextEncoder().encode(text));
		expect(reread.$cerimal.envelope.name).toBe("Wilhelmina");
		expect(reread.$cerimal.documents[0]?.rootType).toBe(
			"Quantum.PlayerSerializedData",
		);
		// And the untouched save still keeps that formatting, because it is still
		// spliced rather than re-serialised.
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
		// Different bytes on purpose — the gold changed — but the same save.
		expect(verdict.kind).toBe("semantic");
		const rebuilt = await encodeSave(edited);
		const reread = await decodeSave(rebuilt);
		const data = reread.$cerimal.documents[0]?.data as { Gold?: number };
		const gold = data?.Gold;
		// The target is pinned rather than read back off the plan, so a change
		// to what "fill the purse" means has to be a deliberate one.
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
			// A plan is a proposal, not an edit: it must not touch the document
			// it was handed, or the staged-edit list would be a fiction.
			expect(JSON.stringify(document)).toBe(before);
		}
	});

	test("every action names a path the save really has", async () => {
		const document = await decodeSave(readFixture(CHARACTER));
		let planned = 0;
		for (const action of noRestForTheWicked.actions) {
			for (const edit of action.plan(document)) {
				planned += 1;
				// The path resolves, and it resolves to the value the action says
				// is already there — which is what makes the staged edit a
				// change rather than a guess, and what the workbench shows the
				// user as "before".
				expect(getAtPath(document, edit.path)).toEqual(edit.before);
				expect(edit.before).not.toEqual(edit.after);
			}
		}
		// Three of the four actions apply to this character, and one of those
		// stages two edits — Health and Stamina — so four edits in all. The
		// fourth is disabled: this character is on softcore, so there is no
		// hardcore mode to leave.
		expect(planned).toBe(4);
	});

	test("an action that has nothing to do greys itself out", async () => {
		// A realm save has no player in it, so none of the four applies, and the
		// workbench disables a button whose plan is empty.
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
		// This character is on softcore, so there is nothing to leave.
		expect(action?.plan(document)).toHaveLength(0);
	});
});
