/**
 * Builds `lib/generated/game-names.json` — the names the editors label their
 * rows with — from a Crimson Desert editor checkout's own extracted data.
 *
 *     bun scripts/build-game-names.ts <path-to-CrimsonSaveEditor>
 *
 * `game_map.json` is the game's table dump (23 MB): every character, sub-level,
 * quest, mission and quest gauge key with the name the game's own data uses.
 * `quest_database.json` adds the quest category and the stages each quest owns.
 * The save file only stores keys, so without this table the quest editor can
 * only show numbers.
 *
 * Only the fields these editors read are kept, which is what makes the output
 * small enough to ship next to the item catalogs. English display strings that
 * the game never resolved (`{StaticInfo:...}` placeholders) are dropped in
 * favour of the internal name, which at least names the thing.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

type Named = { key: number; name?: string; english_name?: string };

type GameMap = {
	characters: Record<string, Named>;
	sublevels: Record<string, Named>;
	quests: Record<string, Named>;
	missions: Record<string, Named>;
	questgauges: Record<string, Named>;
	dyecolorgroups: Record<string, Named>;
};

type QuestRecord = {
	key: number;
	name?: string;
	category_name?: string;
	stages?: number[];
	missions?: number[];
};

/**
 * The player-facing string when the game resolved one, otherwise the internal
 * name, otherwise nothing. A `{StaticInfo:...}` value is a template the game
 * fills in at runtime and is useless to a list view.
 */
const label = (entry: Named): string => {
	const english = entry.english_name ?? "";
	if (english && !english.startsWith("{StaticInfo:")) return english;
	return entry.name ?? "";
};

const names = (table: Record<string, Named>): Record<string, string> => {
	const output: Record<string, string> = {};
	for (const [key, entry] of Object.entries(table ?? {})) {
		const name = label(entry);
		if (name) output[key] = name;
	}
	return output;
};

const source = process.argv[2];
if (!source) {
	throw new Error(
		"Pass the CrimsonSaveEditor directory that holds game_map.json",
	);
}

const gameMap = JSON.parse(
	readFileSync(join(source, "game_map.json"), "utf8"),
) as GameMap;
const questDatabase = JSON.parse(
	readFileSync(join(source, "quest_database.json"), "utf8"),
) as QuestRecord[];

const quests: Record<
	string,
	{ name: string; category: string | null; stages: number[] | null }
> = {};
for (const entry of Object.values(gameMap.quests ?? {})) {
	const key = String(entry.key);
	quests[key] = { name: label(entry), category: null, stages: null };
}
for (const record of questDatabase) {
	const key = String(record.key);
	const existing = quests[key] ?? { name: "", category: null, stages: null };
	existing.category = record.category_name ?? null;
	existing.stages = record.stages?.length ? record.stages : null;
	if (!existing.name && record.name) existing.name = record.name;
	quests[key] = existing;
}

const output = {
	schema_version: 1,
	source: "Crimson Desert game data (game_map.json, quest_database.json)",
	generated_by: "scripts/build-game-names.ts",
	characters: names(gameMap.characters),
	sublevels: names(gameMap.sublevels),
	missions: names(gameMap.missions),
	questGauges: names(gameMap.questgauges),
	dyeColorGroups: names(gameMap.dyecolorgroups),
	quests,
};

const target = join(
	import.meta.dir,
	"..",
	"lib",
	"generated",
	"game-names.json",
);
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(output)}\n`);
console.log(
	`wrote ${target}: ${Object.keys(output.characters).length} characters, ` +
		`${Object.keys(output.quests).length} quests, ` +
		`${Object.keys(output.missions).length} missions, ` +
		`${Object.keys(output.dyeColorGroups).length} dye colour groups`,
);
