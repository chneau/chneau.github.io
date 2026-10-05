/**
 * The unlock / collected-knowledge reader, asserted against both fixtures.
 *
 * Every figure below was measured on these two saves by walking them; the
 * decoder's own notes quote a **third** save (a 64/27 build), so its counts
 * appear nowhere in this file as expectations. What is asserted is what the
 * bytes say, per build.
 *
 * The two fixtures are the point: `8559a` and `52586` have different name
 * tables (3,259 and 6,350 entries), so a reader that resolved a tag by ordinal,
 * or by another build's table, would produce a plausible wrong name on one of
 * them.
 */

import { describe, expect, test } from "bun:test";
import { decompressContainer } from "../lib/container";
import { readNameTable } from "../lib/names";
import { parseTokens } from "../lib/tokens";
import {
	CACHED_WORLD_LIMIT,
	CUSTOM_MAP_PIN_LIMIT,
	QUEST_MAP_PIN_LIMIT,
	readUnlocks,
	readUnlocksFromScan,
	TAG_SAMPLE_LIMIT,
	type Unlocks,
} from "../lib/unlocks";
import { FIXTURE_TIMEOUT_MS, largeSave, smallSave } from "./fixtures";

const scanSmall = (): Unlocks | null =>
	readUnlocks(decompressContainer(smallSave()).data);
const scanLarge = (): Unlocks | null =>
	readUnlocks(decompressContainer(largeSave()).data);

describe("collected knowledge — the player's own CName arrays", () => {
	test(
		"the 8559a save's seven unlock lists, measured",
		() => {
			const found = scanSmall();
			expect(found).not.toBeNull();
			if (found === null) return;
			// Declared `u32` count and measured element length agree on every
			// list, which is the check that `CName` is two bytes: a different
			// width would make the two disagree or fail to parse at all.
			expect(found.booksRead?.count).toBe(11);
			expect(found.booksRead?.declaredCount).toBe(11);
			expect(found.craftingSchematics?.count).toBe(67);
			expect(found.craftingSchematics?.declaredCount).toBe(67);
			expect(found.alchemyRecipes?.count).toBe(30);
			expect(found.alchemyRecipes?.declaredCount).toBe(30);
			expect(found.unlockedAppearances?.count).toBe(33);
			expect(found.expandedCraftingCategories?.count).toBe(3);
			expect(found.expandedAlchemyCategories?.count).toBe(5);
			expect(found.expandedBestiaryCategories?.count).toBe(4);
			expect(found.itemsPerLevel?.count).toBe(24);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"the 52586 save's seven unlock lists, measured",
		() => {
			const found = scanLarge();
			expect(found).not.toBeNull();
			if (found === null) return;
			expect(found.booksRead?.count).toBe(108);
			expect(found.booksRead?.declaredCount).toBe(108);
			expect(found.craftingSchematics?.count).toBe(90);
			expect(found.craftingSchematics?.declaredCount).toBe(90);
			expect(found.alchemyRecipes?.count).toBe(43);
			expect(found.alchemyRecipes?.declaredCount).toBe(43);
			expect(found.unlockedAppearances?.count).toBe(11);
			expect(found.expandedCraftingCategories?.count).toBe(10);
			expect(found.expandedAlchemyCategories?.count).toBe(2);
			expect(found.expandedBestiaryCategories?.count).toBe(4);
			expect(found.itemsPerLevel?.count).toBe(24);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"every tag resolves, and the CName width is two bytes",
		() => {
			for (const found of [scanSmall(), scanLarge()]) {
				if (found === null) throw new Error("no unlocks read");
				for (const list of [
					found.booksRead,
					found.craftingSchematics,
					found.alchemyRecipes,
					found.unlockedAppearances,
					found.expandedCraftingCategories,
					found.expandedAlchemyCategories,
					found.expandedBestiaryCategories,
					found.itemsPerLevel,
					found.knownMapPinTags,
					found.discoveredMapPinTags,
					found.disabledMapPinTags,
					found.discoveredAgentEntityTags,
					found.discoveredPaths,
					found.customEntityMapPins,
					found.customAgentMapPins,
				]) {
					if (list === null || list === undefined) continue;
					const tagList = "unresolved" in list ? list : null;
					if (tagList !== null) {
						expect(tagList.unresolved).toBe(0);
					}
					for (const name of tagList?.names ?? []) {
						if (name !== null) expect(name.length).toBeGreaterThan(0);
					}
				}
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"the same recipe has a different MANU index on each build",
		() => {
			const small = scanSmall();
			const large = scanLarge();
			if (small === null || large === null) {
				throw new Error("no unlocks read");
			}
			const inSmall = small.alchemyRecipes?.names ?? [];
			const inLarge = large.alchemyRecipes?.names ?? [];
			expect(inSmall).toContain("Recipe for Albedo");
			expect(inLarge).toContain("Recipe for Albedo");
			// The *text* is identical across builds and the *index* is not, which
			// is the whole reason a tag goes through this save's own table: read
			// as an ordinal it would name a different recipe on one of the two.
			const smallIndex = readNameTable(
				decompressContainer(smallSave()).data,
			).names.indexOf("Recipe for Albedo");
			const largeIndex = readNameTable(
				decompressContainer(largeSave()).data,
			).names.indexOf("Recipe for Albedo");
			expect(smallIndex).toBeGreaterThan(0);
			expect(largeIndex).toBeGreaterThan(0);
			expect(smallIndex).not.toBe(largeIndex);
		},
		FIXTURE_TIMEOUT_MS,
	);
});

describe("map-pin knowledge — the flat CCommonMapManager run", () => {
	test(
		"the 8559a save's map-pin containers, measured",
		() => {
			const found = scanSmall();
			if (found === null) throw new Error("no unlocks read");
			expect(found.questMapPinStates?.count).toBe(4);
			expect(found.questMapPinStates?.declaredCount).toBe(4);
			expect(found.knownMapPinTags?.count).toBe(26);
			expect(found.knownMapPinTags?.declaredCount).toBe(26);
			expect(found.discoveredMapPinTags?.count).toBe(39);
			expect(found.discoveredMapPinTags?.declaredCount).toBe(39);
			expect(found.disabledMapPinTags?.count).toBe(27);
			expect(found.discoveredAgentEntityTags?.count).toBe(3);
			// Measured empty on both fixtures, and reported as an empty list
			// rather than dropped: the container is there and says zero.
			expect(found.discoveredPaths?.count).toBe(0);
			expect(found.discoveredPaths?.declaredCount).toBe(0);
			expect(found.customEntityMapPins?.count).toBe(0);
			expect(found.customAgentMapPins?.count).toBe(2);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"the 52586 save's map-pin containers, measured",
		() => {
			const found = scanLarge();
			if (found === null) throw new Error("no unlocks read");
			expect(found.questMapPinStates?.count).toBe(59);
			expect(found.questMapPinStates?.declaredCount).toBe(59);
			expect(found.knownMapPinTags?.count).toBe(157);
			expect(found.knownMapPinTags?.declaredCount).toBe(157);
			expect(found.discoveredMapPinTags?.count).toBe(139);
			expect(found.discoveredMapPinTags?.declaredCount).toBe(139);
			expect(found.disabledMapPinTags?.count).toBe(62);
			expect(found.discoveredAgentEntityTags?.count).toBe(16);
			expect(found.discoveredPaths?.count).toBe(0);
			expect(found.customEntityMapPins?.count).toBe(4);
			expect(found.customAgentMapPins?.count).toBe(15);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"a pin container counts pins, not the three VL tokens each pin is",
		() => {
			const found = scanLarge();
			if (found === null) throw new Error("no unlocks read");
			// 15 pins is 45 tokens; a reader that stopped at the next `BS` and
			// counted tokens would report 45 and its `count` would disagree with
			// the save's own `Size`.
			expect(found.customAgentMapPins?.declaredCount).toBe(15);
			expect(found.customAgentMapPins?.count).toBe(15);
			expect(found.customAgentMapPins?.pins).toHaveLength(15);
			expect(found.customAgentMapPins?.pins.map((pin) => pin.type)).toContain(
				"QuestAvailable",
			);
			expect(found.customEntityMapPins?.pins.map((pin) => pin.type)).toContain(
				"MonsterNest",
			);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"a tag resolving to the engine's MISSING_NAME placeholder is counted apart",
		() => {
			const found = scanLarge();
			if (found === null) throw new Error("no unlocks read");
			// The 52586 table carries 9 `MISSING_NAME_<GUID>` entries; 9 of its
			// discovered pins and 2 of its disabled pins land on one. They
			// resolve, so `unresolved` stays 0 — but they are not names, and
			// reporting them as ordinary resolved text would be a lie.
			expect(found.discoveredMapPinTags?.unresolved).toBe(0);
			expect(found.discoveredMapPinTags?.placeholder).toBe(9);
			expect(found.disabledMapPinTags?.placeholder).toBe(2);
			expect(found.knownMapPinTags?.placeholder).toBe(0);
			const small = scanSmall();
			if (small === null) throw new Error("no unlocks read");
			expect(small.discoveredMapPinTags?.placeholder).toBe(0);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"quest pin states carry both guids and the visibility flag",
		() => {
			const found = scanLarge();
			const states = found?.questMapPinStates?.states ?? [];
			expect(states.length).toBeGreaterThan(0);
			for (const state of states) {
				expect(state.objectiveGuid).toMatch(/^[0-9a-f]{32}$/);
				expect(state.mapPinGuid).toMatch(/^[0-9a-f]{32}$/);
				expect(typeof state.state).toBe("boolean");
			}
			// Measured: 53 of the 59 pins shown, 6 hidden. Both values occur, so
			// a reader that read only the first element would look plausible.
			const shown = states.filter((state) => state.state === true).length;
			expect(shown + states.filter((s) => s.state === false).length).toBe(
				states.length,
			);
			expect(shown).toBeGreaterThan(0);
			expect(shown).toBeLessThan(states.length);
		},
		FIXTURE_TIMEOUT_MS,
	);
});

describe("visited regions — CachedWorldDataMap", () => {
	test(
		"the 52586 save: nine levels, four visited",
		() => {
			const found = scanLarge();
			const worlds = found?.cachedWorlds;
			if (worlds === undefined || worlds === null) {
				throw new Error("no cached worlds read");
			}
			expect(worlds.count).toBe(9);
			expect(worlds.declaredCount).toBe(9);
			expect(worlds.visited).toBe(4);
			expect(worlds.worlds.map((world) => world.path)).toEqual([
				"levels\\skellige\\skellige.w2w",
				"levels\\prolog_village_winter\\prolog_village.w2w",
				"dlc\\bob\\data\\levels\\bob\\bob.w2w",
				"levels\\novigrad\\novigrad.w2w",
				"levels\\wyzima_castle\\wyzima_castle.w2w",
				"levels\\prolog_village\\prolog_village.w2w",
				"levels\\island_of_mist\\island_of_mist.w2w",
				"levels\\the_spiral\\spiral.w2w",
				"levels\\kaer_morhen\\kaer_morhen.w2w",
			]);
			const novigrad = worlds.worlds.find(
				(world) => world.path === "levels\\novigrad\\novigrad.w2w",
			);
			expect(novigrad?.visited).toBe(true);
			// Measured: 42 cached quest pins, and only Novigrad has any. This is
			// what separates "the player has been here" from "the game has this
			// level loaded" — the catalogue is the whole shipped set.
			expect(novigrad?.cachedQuestPins).toBe(42);
			expect(
				worlds.worlds.filter((world) => world.cachedQuestPins !== 0).length,
			).toBe(1);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"the 8559a save: ten levels (nine plus dummy.w2w), two visited",
		() => {
			const found = scanSmall();
			const worlds = found?.cachedWorlds;
			if (worlds === undefined || worlds === null) {
				throw new Error("no cached worlds read");
			}
			expect(worlds.count).toBe(10);
			expect(worlds.declaredCount).toBe(10);
			expect(worlds.visited).toBe(2);
			expect(worlds.worlds.map((world) => world.path)).toContain("dummy.w2w");
		},
		FIXTURE_TIMEOUT_MS,
	);
});

describe("caps and the projection contract", () => {
	test(
		"a long list is capped in the sample and whole in the count",
		() => {
			const found = scanLarge();
			// 157 known pins and a 24-name cap: the sample is bounded and the
			// count is not, so the document can say "157" truthfully.
			expect(found?.knownMapPinTags?.count).toBe(157);
			expect(found?.knownMapPinTags?.names.length).toBe(TAG_SAMPLE_LIMIT);
			expect(found?.knownMapPinTags?.names[0]).toBe("nml_mp_tm13");

			const short = scanSmall();
			// A list under the cap keeps every entry: the cap must not shorten
			// one that already fits. Measured at 3 on this save.
			expect(short?.discoveredAgentEntityTags?.count).toBe(3);
			expect(short?.discoveredAgentEntityTags?.names).toEqual([
				"mq0004_old_woman",
				"prologue_smith",
				"mq0002_merchant",
			]);
			// 26 known pins is *over* the 24 cap, so the sample is shortened and
			// the count is not. Asserted rather than assumed: a cap applied to the
			// count instead of the sample would make both 24 and pass a "24" test.
			expect(short?.knownMapPinTags?.count).toBe(26);
			expect(short?.knownMapPinTags?.names.length).toBe(TAG_SAMPLE_LIMIT);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"quest pin states are capped at QUEST_MAP_PIN_LIMIT of 59 measured",
		() => {
			const found = scanLarge();
			expect(found?.questMapPinStates?.count).toBe(59);
			expect(found?.questMapPinStates?.states.length).toBe(QUEST_MAP_PIN_LIMIT);
		},
		FIXTURE_TIMEOUT_MS,
	);

	test(
		"custom pins and cached worlds fit under their caps on both saves",
		() => {
			for (const found of [scanSmall(), scanLarge()]) {
				if (found === null) throw new Error("no unlocks read");
				const pins = Math.max(
					found.customEntityMapPins?.pins.length ?? 0,
					found.customAgentMapPins?.pins.length ?? 0,
				);
				expect(pins).toBeLessThanOrEqual(CUSTOM_MAP_PIN_LIMIT);
				expect(found.cachedWorlds?.worlds.length).toBeLessThanOrEqual(
					CACHED_WORLD_LIMIT,
				);
			}
		},
		FIXTURE_TIMEOUT_MS,
	);

	test("no offset ever reaches the projection", () => {
		const found = scanLarge();
		if (found === null) throw new Error("no unlocks read");
		// The workbench proves a rebuild by decoding it and comparing documents,
		// so a stored address would be a field that differs between two saves of
		// the same build. The scan is serialised whole: no key is an address and
		// no value is a plausible one.
		const json = JSON.stringify(found);
		expect(json).not.toContain("offset");
		expect(json).not.toContain("Offset");
		const walk = (
			value: unknown,
			key: string | undefined,
		): void => {
			if (Array.isArray(value)) {
				for (const item of value) walk(item, key);
				return;
			}
			if (typeof value !== "object" || value === null) {
				// Offsets in this codebase are byte counts in the millions; no
				// count or cap here is.
				if (typeof value === "number" && value > 1_000_000) {
					throw new Error(
						`a value of ${value} at "${key ?? "?"}" looks like an offset`,
					);
				}
				return;
			}
			for (const [childKey, child] of Object.entries(value)) {
				expect(childKey.toLowerCase()).not.toContain("offset");
				walk(child, childKey);
			}
		};
		walk(found, undefined);
	});
});

describe("the reader's own entry points", () => {
	test(
		"readUnlocksFromScan agrees with readUnlocks on both saves",
		() => {
			for (const bytes of [smallSave(), largeSave()]) {
				const data = decompressContainer(bytes).data;
				const names = readNameTable(data).names;
				const tokens = parseTokens(data, names).tokens;
				const viaScan = readUnlocksFromScan(data, names, tokens);
				const viaWalk = readUnlocks(data);
				expect(viaScan).toEqual(viaWalk);
			}
		},
		FIXTURE_TIMEOUT_MS,
	);
});