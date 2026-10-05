/**
 * The quest-title and item-field catalogues, carried as data so the editor ships
 * without the 50 GB game install.
 *
 * `generated/names.json` is a verbatim copy of the source decoder's
 * `data/names.json`, produced by its `script/export-names.ts` against an English
 * install of The Witcher 3. **Only its `quests` section is read here** (236 of
 * 253 journals resolved) — the id→title map, so the UI can show
 * `Contract: Devil by the Well` rather than `mq0003`. The rest of the file
 * travels undecoded and is described where it matters; see the note below.
 *
 * Its `enumTypes` section is **not** re-exported here: it is byte-for-byte the
 * same 351-name list as `ENUM_TYPES` in `./enums`, both written by the same
 * script, and `reflect.ts` needs the typed copy. Shipping both would be two
 * lists that can drift.
 *
 * ## The map is partial, and the lookup says so
 *
 * 236 of 253 journals resolved. A quest id with no entry returns `undefined`
 * rather than the id echoed back, because a UI that cannot distinguish "no
 * title known" from "the title is `mq0003`" will render the raw id as though it
 * were the game's own wording.
 */

import names from "./generated/names.json";

/** The id→title map exactly as the game install resolved it. */
const QUEST_TITLES: Readonly<Record<string, string>> = names.quests;

/*
 * The rest of `generated/names.json` is carried but unread, and the fields are
 * named here rather than bound to constants nothing consumes:
 *
 *  - `itemFields` — the engine's item-class field names, in declaration order.
 *    This is what the engine *calls* durability/upgrade fields; see
 *    `inventory.ts` for why the 30-byte item record does not expose them.
 *  - `generatedBy`, `game`, `language` — the provenance triple, so a stale copy
 *    can be recognised. The catalogue is English-only.
 *  - `Object.keys(quests).length` — how many journal ids have a resolved title.
 *    It is a figure about this file, not a constant, so it is recomputed rather
 *    than frozen.
 *
 * They stay in the JSON because that file is a verbatim copy of the source
 * decoder's, and trimming it would break the correspondence that makes a
 * re-export diff meaningful.
 */

/**
 * The title for a quest id, matched case-insensitively, or `undefined` when the
 * catalogue does not resolve it.
 *
 * Case-insensitive because a fact name arrives in whatever case the save stored
 * (`Q101_…` as well as `q101_…`) and a lookup that missed on case alone would
 * look like a missing entry. The returned title keeps the catalogue's own
 * capitalisation.
 */
export const questTitle = (questId: string): string | undefined => {
	const direct = QUEST_TITLES[questId];
	if (direct !== undefined) return direct;
	const wanted = questId.toLowerCase();
	for (const [id, title] of Object.entries(QUEST_TITLES)) {
		if (id.toLowerCase() === wanted) return title;
	}
	return undefined;
};
