/**
 * The world-entity flag census, asserted on both committed saves.
 *
 * Every figure below was measured by running `readEntityFlags` against the two
 * fixtures and reading its output; where the reference decoder's note gives the
 * same number for the same file, the test says so in a comment, and where the two
 * disagree the disagreement is the point (see `isDead` on the small fixture, which
 * is 95 entities of 640 rather than the 18 of 6,525 the decoder's table gives for
 * the large save — a level-4 playthrough has killed more of what it has met).
 *
 * ## What these tests are for
 *
 * Three things beyond "the numbers did not move":
 *
 *  - **No offset reaches the output.** A document field that is a byte offset in
 *    the decompressed stream is a field that goes stale the moment the file is
 *    rewritten, and the round-trip check would compare it against itself. Every
 *    value must be a function of the bytes with no positional input, so the whole
 *    report is walked and asserted to carry none.
 *  - **Absence is `null`-shaped, not `0`-shaped.** A property the save never
 *    writes is reported `state: "unused"`, with `inNameTable` distinguishing "the
 *    engine knows this field and this playthrough never tripped it" from "this
 *    build's name table has never heard of it". Both occur on `8559a`.
 *  - **The refusals are refusals.** No bit above 23 is named, no mode is named,
 *    and the generic containers' table is reported as counts. Each is asserted
 *    rather than left to a comment, because a decoder that grows confident is the
 *    failure this module exists to avoid.
 *
 * The two fixtures cost ~1.2 s and ~0.2 s to decode, and `FIXTURE_TIMEOUT_MS` is
 * required: Bun's 5 s default is a known flake on this tree.
 */

import { describe, expect, test } from "bun:test";
import { decompressContainer } from "../lib/container";
import {
	type EntityFlags,
	type FlagUsage,
	readEntityFlags,
} from "../lib/entities";
import { readNameTable } from "../lib/names";
import { FIXTURE_TIMEOUT_MS, largeSave, smallSave } from "./fixtures";

/** The decompressed stream of a fixture, plus its own name table. */
const read = (file: Uint8Array): { data: Uint8Array; report: EntityFlags } => {
	const data = decompressContainer(file).data;
	const names = readNameTable(data).names;
	return { data, report: readEntityFlags(data, names) };
};

/**
 * The written row for one flag name.
 *
 * Throwing rather than returning `undefined` is deliberate: a test that reads a
 * missing row as "absent" is a test that passes when the decoder stops reporting
 * the flag at all.
 */
const written = (
	report: EntityFlags,
	name: string,
): Extract<FlagUsage, { state: "written" }> => {
	const row = report.flags.find((flag) => flag.name === name);
	if (row === undefined || row.state !== "written") {
		throw new Error(
			`expected ${name} to be written, got ${row?.state ?? "absent"}`,
		);
	}
	return row;
};

/** The unused row for one flag name, or `undefined` when it is written. */
const unused = (
	report: EntityFlags,
	name: string,
): Extract<FlagUsage, { state: "unused" }> | undefined => {
	const row = report.flags.find((flag) => flag.name === name);
	return row?.state === "unused" ? row : undefined;
};

/**
 * Every own key of every value in the report, recursively.
 *
 * Written as a walk over `unknown` rather than over a typed shape because the
 * claim under test is about *any* field carrying a positional value, including
 * one this module grows next month.
 */
const keysOf = (value: unknown, found: string[] = []): string[] => {
	if (Array.isArray(value)) {
		for (const item of value) keysOf(item, found);
		return found;
	}
	if (typeof value === "object" && value !== null) {
		for (const [key, item] of Object.entries(value)) {
			found.push(key);
			keysOf(item, found);
		}
	}
	return found;
};

describe("the world-entity flag census", () => {
	test(
		"the large save holds 6,525 entity property lists over 149 names",
		() => {
			const { report } = read(largeSave());
			// Both figures are the reference decoder's, measured on this same file:
			// 6,525 property lists and 149 distinct names (docs §E7).
			expect(report.entities).toBe(6_525);
			expect(report.distinctPropertyNames).toBe(149);
			// 290 is `readContainers`' own figure for the same file, reached
			// independently: this module counts `entityData` spans from the object
			// tree, the inventory reader counts them the same way.
			expect(report.promotedEntities).toBe(290);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test("the small save holds 640 entity property lists over 113 names", () => {
		const { report } = read(smallSave());
		expect(report.entities).toBe(640);
		expect(report.distinctPropertyNames).toBe(113);
		expect(report.promotedEntities).toBe(112);
	});

	test(
		"the promoted entities are a small minority, and the gap is reported",
		() => {
			// Which entities get promoted to `layerStorage` is not determined (the
			// decoder's open question O7), and it matters: a flag on an un-promoted
			// entity may not survive a round-trip. So the report says how many of
			// the flagged entities could be named rather than implying all of them
			// could.
			const { report } = read(largeSave());
			expect(report.entitiesWithNotableFlags).toBe(798);
			expect(report.namedEntitiesWithNotableFlags).toBe(264);
			expect(report.namedEntitiesWithNotableFlags).toBeLessThan(
				report.entitiesWithNotableFlags,
			);
			expect(report.entitiesWithNotableFlags).toBeLessThan(report.entities);
		},
		FIXTURE_TIMEOUT_MS,
	);
});

describe("per-flag counts on the large save", () => {
	const large = () => read(largeSave()).report;

	test("the alive/dead flags", () => {
		const report = large();
		// 18 of 6,525 entities write `isDead` at all; 3 of those say true. The other
		// 6,507 write nothing, which means the field is at its default and says
		// nothing about the entity's state.
		expect(written(report, "isDead").entities).toBe(18);
		expect(written(report, "isDead").values).toEqual([
			{ value: "false", entities: 15 },
			{ value: "true", entities: 3 },
		]);
		expect(written(report, "immortalityFlags").entities).toBe(274);
		expect(written(report, "immortalityFlagsCopy").entities).toBe(15);
	});

	test("the destroyed flags", () => {
		const report = large();
		expect(written(report, "destroyed").entities).toBe(56);
		expect(written(report, "m_wasDestroyed").entities).toBe(53);
		expect(written(report, "canBeDestroyed").values).toEqual([
			{ value: "true", entities: 49 },
		]);
	});

	test("the looted flags, which are per-entity on a clue stash", () => {
		const report = large();
		expect(written(report, "lootWasOfferedToPlayer").values).toEqual([
			{ value: "false", entities: 29 },
			{ value: "true", entities: 7 },
		]);
		expect(written(report, "stashWasLooted").values).toEqual([
			{ value: "false", entities: 27 },
			{ value: "true", entities: 9 },
		]);
		expect(written(report, "isStashDisabled").entities).toBe(36);
	});

	test("the NPC interaction switches", () => {
		const report = large();
		// 2 entities, both `false` — the permanent mute, not the transient one the
		// script keeps out of the save.
		expect(written(report, "isTalkDisabled").values).toEqual([
			{ value: "false", entities: 2 },
		]);
		expect(written(report, "dontUseReactionOneLiners").values).toEqual([
			{ value: "true", entities: 37 },
			{ value: "false", entities: 2 },
		]);
		expect(written(report, "disableConstrainLookat").entities).toBe(3);
		expect(written(report, "canFlee").entities).toBe(2);
		expect(written(report, "levelFakeAddon").values).toEqual([
			{ value: "0", entities: 2 },
			{ value: "17", entities: 1 },
			{ value: "14", entities: 1 },
			{ value: "5", entities: 1 },
		]);
	});

	test("the merchant stock clock", () => {
		const report = large();
		// 65 entities, 12 distinct day numbers. This is the one piece of merchant
		// state an editor could meaningfully write (`merchantNPC.ws:187` compares
		// it against `gameTimeDay` to decide the refill), and it is not written
		// here.
		const clock = written(report, "lastDayOfInteraction");
		expect(clock.entities).toBe(65);
		expect(clock.distinctValues).toBe(12);
		expect(clock.values[0]).toEqual({ value: "18", entities: 37 });
	});

	test("the witcher-senses and bestiary clues", () => {
		const report = large();
		expect(written(report, "wasSeen").values).toEqual([
			{ value: "false", entities: 2_840 },
			{ value: "true", entities: 293 },
		]);
		expect(written(report, "wasDetected").values).toEqual([
			{ value: "false", entities: 2_954 },
			{ value: "true", entities: 179 },
		]);
		// Written by all 3,133 and `false` on every one: the field is persisted and
		// never set, which is a different claim from "the field does not exist".
		expect(written(report, "medallionVibratedEver").values).toEqual([
			{ value: "false", entities: 3_133 },
		]);
		expect(written(report, "nestFound").entities).toBe(30);
	});

	test("the respawn pair, and the GameTime this reader declines to decode", () => {
		const report = large();
		expect(written(report, "fullRespawnScheduled").values).toEqual([
			{ value: "false", entities: 566 },
			{ value: "true", entities: 13 },
		]);
		// Written by the same 579 entities — the pairing is the point — but its
		// value is reported as nothing. The token walker's fixed `GameTime` width is
		// 11 where the writer emitted 15, so `reflectValue` cannot close on it and
		// the fix belongs in `tokens.ts`.
		const respawn = written(report, "fullRespawnTime");
		expect(respawn.entities).toBe(579);
		expect(respawn.type).toBe("GameTime");
		expect(respawn.values).toEqual([]);
		expect(respawn.distinctValues).toBe(0);
	});

	test("the quest-only allow-list, resolved through this save's own name table", () => {
		const report = large();
		const shown = written(report, "questEntitiesToBeShown");
		expect(shown.entities).toBe(20);
		// Distinct lengths: 5 of the 20 are an empty list, which is why the
		// histogram shows `[0]` five times rather than a name.
		expect(shown.distinctValues).toBe(5);
		expect(shown.values).toEqual([
			{ value: "[3]", entities: 6 },
			{ value: "[0]", entities: 5 },
			{ value: "[1]", entities: 5 },
			{ value: "[2]", entities: 3 },
			{ value: "[4]", entities: 1 },
		]);
		expect(written(report, "questNonActorEntitiesToBeShown").entities).toBe(20);
	});
});

describe("per-flag counts on the small save", () => {
	const small = () => read(smallSave()).report;

	test("the alive/dead flags differ from the large save, and the reason is not the decoder", () => {
		const report = small();
		// 95 of 640 entities write `isDead`, and 82 say true — against 18 and 3 on
		// the large save. The decoder's table gives 18 because that table is the
		// large save's; a level-4 playthrough has killed more of the 640 it met. The
		// ratio is the giveaway: 82/95 dead out of a save whose whole entity list is
		// under a tenth the size, which is what a short game full of corpses looks
		// like and not what a decode fault looks like.
		expect(written(report, "isDead").values).toEqual([
			{ value: "true", entities: 82 },
			{ value: "false", entities: 13 },
		]);
		expect(written(report, "immortalityFlags").entities).toBe(33);
		expect(written(report, "immortalityFlagsCopy").entities).toBe(13);
	});

	test("the merchant clock and the clue flags", () => {
		const report = small();
		expect(written(report, "lastDayOfInteraction").entities).toBe(8);
		expect(written(report, "stashWasLooted").values).toEqual([
			{ value: "true", entities: 4 },
		]);
		expect(written(report, "canBeDestroyed").entities).toBe(2);
	});

	test("the clue flags that 52586 writes in bulk are rare here", () => {
		const report = small();
		// 226 against 3,133: the small save has a tenth of the entities, and the
		// three clue flags scale with it — which is the check that they track the
		// entity list rather than some fixed region of the stream.
		expect(written(report, "wasSeen").entities).toBe(226);
		expect(written(report, "wasDetected").entities).toBe(226);
		expect(written(report, "medallionVibratedEver").entities).toBe(226);
	});
});

describe("a property the save never writes is reported as unused, not as zero", () => {
	test("the small save writes neither `m_wasDestroyed` nor `levelFakeAddon`, and its name table has neither", () => {
		const report = read(smallSave()).report;
		// `inNameTable: false` — this build's `MANU` has never heard of the name, so
		// there is no "count of entities with it" to report even in principle.
		expect(unused(report, "m_wasDestroyed")).toEqual({
			name: "m_wasDestroyed",
			state: "unused",
			inNameTable: false,
		});
		expect(unused(report, "levelFakeAddon")).toEqual({
			name: "levelFakeAddon",
			state: "unused",
			inNameTable: false,
		});
	});

	test("the small save knows `isTalkDisabled` and `disableConstrainLookat` but no quest tripped either", () => {
		const report = read(smallSave()).report;
		// `inNameTable: true` — the engine's field is in this save's own symbol pool
		// and simply is not written. Reporting `0` here would be indistinguishable
		// from a decoder that walked the wrong region.
		expect(unused(report, "isTalkDisabled")).toEqual({
			name: "isTalkDisabled",
			state: "unused",
			inNameTable: true,
		});
		expect(unused(report, "disableConstrainLookat")).toEqual({
			name: "disableConstrainLookat",
			state: "unused",
			inNameTable: true,
		});
	});

	test("the large save writes every tracked flag, so nothing is unused", () => {
		const report = read(largeSave()).report;
		expect(report.flags.every((flag) => flag.state === "written")).toBe(true);
	});

	test("an unused flag contributes no histogram and no entity count at all", () => {
		// The shape itself, asserted on a row that is genuinely unused: there is no
		// `entities: 0` to be read as data, because the field does not exist on this
		// branch of the union.
		const row = unused(read(smallSave()).report, "m_wasDestroyed");
		expect(row).toBeDefined();
		expect(Object.keys(row ?? {})).toEqual(["name", "state", "inNameTable"]);
	});
});

describe("immortalityFlags, and what it refuses to say", () => {
	test("bits 0–23 resolve to a modeOffset and a channel", () => {
		const report = read(largeSave()).report;
		const imm = report.immortality;
		expect(imm.entities).toBe(274);
		expect(imm.copyEntities).toBe(15);
		expect(imm.distinctValues).toBe(6);
		// Only three bit positions occur, and they are exactly the three documented
		// block offsets — which is what makes the channel reading sound.
		expect(imm.bits).toEqual([
			{
				bit: 0,
				mask: 1,
				modeOffset: 1,
				channel: "AIC_Default",
				entities: 195,
			},
			{
				bit: 8,
				mask: 256,
				modeOffset: 256,
				channel: "AIC_Default",
				entities: 17,
			},
			{
				bit: 16,
				mask: 65_536,
				modeOffset: 65_536,
				channel: "AIC_Default",
				entities: 46,
			},
		]);
		// 46 rather than 43 because three entities carry `16842752` = bit 24 | bit 16,
		// so bit 16 is set on 43 + 3 of them.
	});

	test("no bit above 23 is given a mode, a channel, or a name", () => {
		const imm = read(largeSave()).report.immortality;
		expect(imm.bits.every((bit) => bit.bit < 24)).toBe(true);
		expect(imm.bits.every((bit) => bit.modeOffset !== null)).toBe(true);
		// 4 entities set bit 24 (`16777216`, and the `16842752` that adds bit 16).
		// `actor.ws` masks those away before interpreting, so they are counted and
		// left alone.
		expect(imm.entitiesWithUndocumentedBits).toBe(4);
		expect(Object.keys(imm.bits[0] ?? {}).sort()).toEqual([
			"bit",
			"channel",
			"entities",
			"mask",
			"modeOffset",
		]);
	});

	test("the raw values are reported alongside, so a reader can check the bits", () => {
		const imm = read(largeSave()).report.immortality;
		expect(imm.values).toEqual([
			{ value: "1", entities: 195 },
			{ value: "65536", entities: 43 },
			{ value: "256", entities: 17 },
			{ value: "0", entities: 15 },
			{ value: "16842752", entities: 3 },
			{ value: "16777216", entities: 1 },
		]);
		// Every value is a power of two, or a power of two plus bit 24 — never a
		// counter. That is the evidence the field is a bit set at all. The one
		// exception is the zero 15 entities carry, which sets no bit and is exactly
		// what "no immortality mode claimed" looks like.
		for (const row of imm.values) {
			const value = Number(row.value);
			let rest = value;
			let bits = 0;
			for (let bit = 0; bit < 32; bit += 1) {
				rest &= ~(2 ** bit);
				bits += (value >>> bit) & 1;
			}
			expect(rest).toBe(0);
			// `0` is allowed and is counted as 15 entities; everything else must be
			// non-empty, i.e. must set at least one bit.
			if (value !== 0) expect(bits).toBeGreaterThan(0);
			// And nothing sets a bit between the documented 0–23 and the top: the only
			// bit outside the mask that occurs anywhere is 24.
			for (let bit = 0; bit < 32; bit += 1) {
				if ((value >>> bit) & 1) expect([0, 8, 16, 24]).toContain(bit);
			}
		}
	});

	test("the small save's bits resolve the same way", () => {
		const imm = read(smallSave()).report.immortality;
		expect(imm.entities).toBe(33);
		expect(imm.entitiesWithUndocumentedBits).toBe(1);
		expect(
			imm.bits.map((bit) => [bit.bit, bit.modeOffset, bit.entities]),
		).toEqual([
			[0, 1, 6],
			[8, 256, 12],
			[16, 65_536, 1],
		]);
	});
});

describe("generic containers: the count, and nothing per-entity", () => {
	test("the large save's state table has 6,884 records and a set of ids", () => {
		const state = read(largeSave()).report.genericContainerState;
		if (state === null) throw new Error("expected a container state table");
		expect(state.records).toBe(6_884);
		// A set, not a list: every 16-byte id is distinct, which is what the
		// reference decoder measured on this file.
		expect(state.distinctIdentifiers).toBe(6_884);
	});

	test(
		"the ids are not GUIDs, which is why no entity can be named from this table",
		() => {
			const state = read(largeSave()).report.genericContainerState;
			if (state === null) throw new Error("expected a container state table");
			// 2,198 of 6,884 pass an RFC-4122 version+variant test: 31.9%, the rate a
			// random 16-byte value gives. A real GUID table would pass nearly always.
			// This is the measurement behind the refusal to claim which container a
			// mask belongs to — so it is asserted. (The reference decoder's prose
			// quotes the same 31.9% while its own probe table prints 0; the prose's
			// figure is the one reproducible here.)
			expect(state.rfc4122ShapedIdentifiers).toBe(2_198);
			expect(state.rfc4122ShapedIdentifiers / state.records).toBeCloseTo(
				0.319,
				2,
			);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test("the mask values are reported, and every one is a negative bit mask", () => {
		const state = read(largeSave()).report.genericContainerState;
		if (state === null) throw new Error("expected a container state table");
		expect(state.distinctMasks).toBe(19);
		expect(state.masks.length).toBeLessThanOrEqual(8);
		expect(state.masks[0]).toEqual({ value: "-2", entities: 3_210 });
		for (const row of state.masks) {
			const value = Number(row.value);
			// The field is a **sixteen-bit bit set held mostly all-ones**, so a clear
			// bit is the notable one: `-1` is 0xFFFF (nothing cleared), `-2` is 0xFFFE
			// (bit 0 clear), `-4` is 0xFFFC (bits 0–1 clear), `-56` is 0xFFC8 (three
			// bits clear). Every value is therefore negative and 16-bit — which is
			// what makes it a bit set, and is also why the distribution cannot be
			// read as "bit N means X": the frequency is of *absences*, and this
			// decoder does not know which absence is which.
			expect(value).toBeLessThan(0);
			expect(value).toBeGreaterThanOrEqual(-0x8000);
			// Every mask except the all-ones `-1` has at least one clear bit in the
			// low half, so no mask is "all ones in the low byte" by accident.
			if (value !== -1) expect(~value & 0xffff & 0xff).not.toBe(0);
		}
	});

	test("the small save's table has 257 records", () => {
		const state = read(smallSave()).report.genericContainerState;
		if (state === null) throw new Error("expected a container state table");
		expect(state.records).toBe(257);
		expect(state.distinctIdentifiers).toBe(257);
		expect(state.rfc4122ShapedIdentifiers).toBe(81);
		expect(state.masks[0]).toEqual({ value: "-2", entities: 183 });
	});
});

describe("the flagged-entity sample", () => {
	test(
		"it is capped, and the totals beside it are not",
		() => {
			const report = read(largeSave()).report;
			expect(report.sample).toHaveLength(24);
			expect(report.namedEntitiesWithNotableFlags).toBe(264);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test("every sampled entity carries a label and at least one flagged reading", () => {
		const report = read(largeSave()).report;
		for (const entity of report.sample) {
			expect(entity.label.length).toBeGreaterThan(0);
			expect(entity.flags.length).toBeGreaterThan(0);
		}
	});

	test("the player is identifiable, by the one token unique to its entity", () => {
		const report = read(largeSave()).report;
		const player = report.sample.find((entity) => entity.label === "player");
		expect(player).toBeDefined();
		// The player entity carries bit 24, the undocumented one — which is a nice
		// check that the sample is reading the real entity and not a neighbour.
		expect(player?.flags.map((flag) => flag.name)).toContain(
			"immortalityFlags",
		);
	});

	test("a community basename and an idTag fallback both occur on the large save", () => {
		const report = read(largeSave()).report;
		const labels = report.sample.map((entity) => entity.label);
		expect(labels.some((label) => label.startsWith("idTag "))).toBe(true);
		// A basename, not a path and not a hex string: `q305_theatre_helpers`, say.
		expect(
			labels.some(
				(label) =>
					!label.startsWith("idTag ") &&
					label !== "player" &&
					/^[a-z0-9_]+$/.test(label),
			),
		).toBe(true);
	});

	test("the small save names its merchant and its innkeeper", () => {
		const report = read(smallSave()).report;
		const labels = report.sample.map((entity) => entity.label);
		expect(labels).toContain("mq0002_merchant");
		expect(labels).toContain("inkeeper_elza");
	});

	test("no sampled reading claims a value for a GameTime it could not decode", () => {
		const report = read(largeSave()).report;
		for (const entity of report.sample) {
			for (const flag of entity.flags) {
				expect(flag.value).not.toBe("");
				expect(flag.name).not.toBe("fullRespawnTime");
			}
		}
	});
});

describe("the report carries no offset", () => {
	test(
		"no field of the large save's report is named like a position",
		() => {
			const { report } = read(largeSave());
			const keys = keysOf(report);
			// `InventoryItem` does carry an `offset`, and `readContainers` returns
			// one per frame — so this is the property that has to be held here, not
			// a formality. A document field holding a byte offset goes stale the
			// moment the file is rewritten, and the round-trip check would compare
			// it against itself.
			expect(keys).not.toContain("offset");
			expect(keys).not.toContain("at");
			expect(keys).not.toContain("byteOffset");
			expect(keys).not.toContain("span");
			// And no value is a plausible in-file position either: the entity count
			// is the largest number in the report and it is nowhere near the
			// decompressed stream's length.
			expect(report.entities).toBeLessThan(10_000);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"nor does the small save's",
		() => {
			expect(keysOf(read(smallSave()).report)).not.toContain("offset");
		},
		FIXTURE_TIMEOUT_MS,
	);
});

describe("purity", () => {
	test(
		"reading the same bytes twice gives the same report",
		() => {
			// A value that is a function of the bytes has no positional input. If
			// anything in this module read a clock, a counter, or a mutable buffer,
			// this is where it would show — and the sample order is the likeliest
			// place, since it is built by walking the stream.
			const first = read(largeSave()).report;
			const second = read(largeSave()).report;
			expect(JSON.stringify(second)).toBe(JSON.stringify(first));
		},
		FIXTURE_TIMEOUT_MS,
	);
});
