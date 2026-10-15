import { describe, expect, test } from "bun:test";
import { decompressContainer } from "../lib/container";
import {
	type EntityFlags,
	type FlagUsage,
	readEntityFlags,
} from "../lib/entities";
import { readNameTable } from "../lib/names";
import { FIXTURE_TIMEOUT_MS, largeSave, smallSave } from "./fixtures";

const read = (file: Uint8Array): { data: Uint8Array; report: EntityFlags } => {
	const data = decompressContainer(file).data;
	const names = readNameTable(data).names;
	return { data, report: readEntityFlags(data, names) };
};

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

const unused = (
	report: EntityFlags,
	name: string,
): Extract<FlagUsage, { state: "unused" }> | undefined => {
	const row = report.flags.find((flag) => flag.name === name);
	return row?.state === "unused" ? row : undefined;
};

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
			expect(report.entities).toBe(6_525);
			expect(report.distinctPropertyNames).toBe(149);
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
			const { report } = read(largeSave());
			expect(report.entitiesWithNotableFlags).toBe(820);
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
		expect(written(report, "medallionVibratedEver").values).toEqual([
			{ value: "false", entities: 3_133 },
		]);
		expect(written(report, "nestFound").entities).toBe(30);
	});

	test("the respawn pair, and the GameTime now read for real", () => {
		const report = large();
		expect(written(report, "fullRespawnScheduled").values).toEqual([
			{ value: "false", entities: 566 },
			{ value: "true", entities: 13 },
		]);
		const respawn = written(report, "fullRespawnTime");
		expect(respawn.entities).toBe(579);
		expect(respawn.type).toBe("GameTime");
		expect(respawn.distinctValues).toBe(33);
		expect(respawn.values[0]).toEqual({ value: "0", entities: 544 });
	});

	test("the quest-only allow-list, resolved through this save's own name table", () => {
		const report = large();
		const shown = written(report, "questEntitiesToBeShown");
		expect(shown.entities).toBe(20);
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
		expect(written(report, "wasSeen").entities).toBe(226);
		expect(written(report, "wasDetected").entities).toBe(226);
		expect(written(report, "medallionVibratedEver").entities).toBe(226);
	});
});

describe("a property the save never writes is reported as unused, not as zero", () => {
	test("the small save writes neither `m_wasDestroyed` nor `levelFakeAddon`, and its name table has neither", () => {
		const report = read(smallSave()).report;
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
	});

	test("no bit above 23 is given a mode, a channel, or a name", () => {
		const imm = read(largeSave()).report.immortality;
		expect(imm.bits.every((bit) => bit.bit < 24)).toBe(true);
		expect(imm.bits.every((bit) => bit.modeOffset !== null)).toBe(true);
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
		for (const row of imm.values) {
			const value = Number(row.value);
			const withoutTopBit = value & ~(2 ** 24);
			const powerOfTwo =
				withoutTopBit === 0 || (withoutTopBit & (withoutTopBit - 1)) === 0;
			expect({ value: row.value, powerOfTwo }).toEqual({
				value: row.value,
				powerOfTwo: true,
			});
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
		expect(state.distinctIdentifiers).toBe(6_884);
	});

	test(
		"the ids are not GUIDs, which is why no entity can be named from this table",
		() => {
			const state = read(largeSave()).report.genericContainerState;
			if (state === null) throw new Error("expected a container state table");
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
			expect(value).toBeLessThan(0);
			expect(value).toBeGreaterThanOrEqual(-0x8000);
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
		expect(player?.flags.map((flag) => flag.name)).toContain(
			"immortalityFlags",
		);
	});

	test("a community basename and an idTag fallback both occur on the large save", () => {
		const report = read(largeSave()).report;
		const labels = report.sample.map((entity) => entity.label);
		expect(labels.some((label) => label.startsWith("idTag "))).toBe(true);
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
			expect(keys).not.toContain("offset");
			expect(keys).not.toContain("at");
			expect(keys).not.toContain("byteOffset");
			expect(keys).not.toContain("span");
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
			const first = read(largeSave()).report;
			const second = read(largeSave()).report;
			expect(JSON.stringify(second)).toBe(JSON.stringify(first));
		},
		FIXTURE_TIMEOUT_MS,
	);
});
