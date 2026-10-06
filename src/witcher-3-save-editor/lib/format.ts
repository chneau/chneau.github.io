/**
 * The Witcher 3: Wild Hunt `.sav` — the codec this app contributes to the
 * workbench.
 *
 * ## What this file is responsible for
 *
 * The shared workbench knows how to read a document, stage edits against it,
 * re-encode, and prove the re-encode by decoding it again. It knows nothing
 * about `SNFH` containers, LZ4 blocks or the REDkit token stream. This module
 * supplies the game-specific half.
 *
 * ## How a save is edited at all
 *
 * The decoder this codec is built on is **read-only by design** — its own notes
 * say "never assume a write path exists", which was the right instinct while
 * the format was still being understood. A writer turned out to be possible
 * anyway, and the reason is structural rather than lucky:
 *
 * - A `.sav` has **no checksum**. Not in the container, not in the `SAV3`
 *   stream, not in the footer. The one CRC in the game belongs to the asset
 *   *bundle* format, a different file entirely.
 * - Every offset that could shift lives in the 3084-byte container header, and
 *   the `SAV3` header, footer, `SC` span index and variable table all address
 *   the **decompressed** stream.
 *
 * So a field whose **width does not change** can be written in place, and the
 * rebuilt file is accepted. That is the whole strategy: the payload is carried
 * verbatim, the fields we understand are overwritten at the offsets they were
 * read from, and everything else survives untouched. Measured: patching money,
 * level and both point counters changes 7 bytes of a 5,108,010-byte payload and
 * the rebuilt file re-reads every one of them correctly.
 *
 * What this deliberately cannot do is *resize* anything. Adding a skill or
 * renaming a string changes a length, which moves every offset after it and
 * would require rewriting the `AVAL` length, the enclosing frame sizes, the
 * `SC` span index and the variable table — whose coordinate base is still not
 * fully understood. So the edits offered here are scalars only. That is a
 * limitation of the format work, not an oversight, and the page says so.
 *
 * ## Offsets are discovered, never stored
 *
 * The document carries **values, never addresses**. Three saves of the same
 * build put the wallet at 3640748, 3640300 and 3640999, because everything
 * before it in the stream moves; a stored offset would silently corrupt
 * whichever save it did not belong to. `encode` re-derives every address from
 * the payload it is about to write, which is also why it cannot be fooled by a
 * document edited by hand in the inspector.
 *
 * ## Why the scaffold is non-enumerable
 *
 * The workbench proves a rebuild by decoding it and comparing the resulting
 * *document* with the one that was encoded. So every field a document exposes
 * must be a function of the save's bytes, or the check reports a difference in
 * a field nobody touched and calls the file unsound. The payload is exactly
 * such a field: the document describes the pre-edit bytes while `encode`
 * produces post-edit ones.
 *
 * Attaching it as a normal property does not work, and neither does hiding it
 * on the root: the workbench folds edits with `setAtPath`, which rebuilds the
 * root with an object spread, so anything non-enumerable on the root is lost by
 * the time `encode` runs. It rides instead on a branch no edit rebuilds, as a
 * non-enumerable property of its own object — so it survives every spread, and
 * `JSON.stringify` skips it so the comparison sees only the readable
 * projection.
 */

import type { Bytes } from "../../shared/save/bytes";
import { describeError } from "../../shared/save/errors";
import {
	arrayAt,
	isJsonObject,
	type JsonValue,
	numberAt,
	objectAt,
	requireArrayAt,
	requireStringAt,
	stringAt,
} from "../../shared/save/json";
import type {
	FormatNote,
	QuickAction,
	SaveCodec,
	SaveEdit,
	SummaryRow,
} from "../../shared/save/types";
import { addItemsToPayload } from "./add-item";
import { localizedString, questTitle } from "./catalog";
import { decompressContainer, type SaveContainer } from "./container";
import { buildContainer } from "./container-write";
import { readDialogues } from "./dialogues";
import { readEntityFlags } from "./entities";
import { readFactDB } from "./facts";
import { readSaveVersion } from "./inner";
import { readContainers } from "./inventory";
import { readJournal } from "./journal";
import { maxMutationsInPayload } from "./max-mutations";
import { readObjectTree } from "./objects";
import { readPlayer } from "./player";
import { questStepDetail } from "./quest-steps";
import { questProgress } from "./quests";
import { experienceToNextLevel, type LevelDefinition } from "./stats";
import { readUnlocksFromScan } from "./unlocks";
import { locateWritable, type PatchableScalar, patchScalar } from "./write";

/** Route slug, matching the app's directory name. */
const ID = "witcher-3-save-editor";

/** The payload and chunk layout `encode` writes back into. */
type Scaffold = {
	/** The decompressed stream, edited in place. */
	readonly payload: Uint8Array;
	/** The original chunk records, so the table's sizes stay authoritative. */
	readonly chunks: readonly {
		readonly index: number;
		readonly compressedSize: number;
		readonly decompressedSize: number;
		readonly endOffset: number;
		readonly start: number;
	}[];
};

const SCAFFOLD_KEY = "scaffold";

/**
 * Recognise a scaffold by its shape rather than asserting one.
 *
 * The value riding here was attached by `decode`, but `encode` receives an
 * untyped `JsonValue` and must not take that on trust — a document the user
 * hand-edited in the inspector could hold anything under this key. A predicate
 * that checks the two fields that matter is both safer and honest, where a cast
 * would be a claim nothing checks.
 */
const isScaffold = (value: unknown): value is Scaffold => {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as { payload?: unknown; chunks?: unknown };
	return (
		candidate.payload instanceof Uint8Array && Array.isArray(candidate.chunks)
	);
};

/**
 * Attach the payload to the document's scaffold *branch*.
 *
 * The branch matters and the mistake is easy: defining the property on the root
 * instead looks identical from `decode` and is destroyed by the first edit,
 * because the workbench folds with `setAtPath`, which rebuilds the root with an
 * object spread and copies only enumerable properties. Measured: with the
 * property on the root, one edit was enough to lose the save and make `encode`
 * refuse; on the branch, it survives every fold.
 */
const attachScaffold = (doc: JsonValue, scaffold: Scaffold): void => {
	if (!isJsonObject(doc)) return;
	const branch = doc[SCAFFOLD_KEY];
	if (branch === undefined || !isJsonObject(branch)) return;
	const holder: Record<string, unknown> = branch;
	Object.defineProperty(holder, "bytes", {
		value: scaffold,
		enumerable: false,
		writable: false,
		configurable: true,
	});
};

const readScaffold = (doc: JsonValue): Scaffold | undefined => {
	if (!isJsonObject(doc)) return undefined;
	const branch = doc[SCAFFOLD_KEY];
	if (branch === undefined || !isJsonObject(branch)) return undefined;
	const holder: Record<string, unknown> = branch;
	const scaffold: unknown = holder.bytes;
	return isScaffold(scaffold) ? scaffold : undefined;
};

/** One learned skill, as the page shows it. */
type SkillRow = {
	readonly name: string;
	readonly level: number | null;
	readonly maxLevel: number | null;
};

/**
 * One entry of the saved mutation catalogue (Blood and Wine), as the page shows
 * it. Read-only — the editor decodes mutations but does not write them.
 */
type MutationRow = {
	/** the `MANU` symbolic name of the `EPlayerMutationType` value */
	readonly name: string | null;
	readonly colors: readonly string[];
	/** invested vs required per colour and skill point, `null` where absent */
	readonly progress: Readonly<Record<string, number | null>> | null;
	readonly requiredMutations: readonly string[];
	/** the `w3strings` key whose text is the mutation's display name */
	readonly nameKey: string | null;
	/** the display text for `nameKey` (`Euphoria`), or `null` if not shipped */
	readonly label: string | null;
};

/**
 * The label for a difficulty index, read out of the document's own `choices`.
 *
 * Computed rather than stored: a difficulty's name is a function of its index
 * and this save's name table, so a document that carried both would hold two
 * fields for one fact and could be made to disagree with itself.
 */
const difficultyLabel = (doc: JsonValue): string => {
	const branch = objectAt(doc, "difficulty");
	if (branch === undefined) return "unknown";
	const index = numberAt(branch, "index");
	if (index === undefined || index === null) return "unknown";
	if (!Array.isArray(branch.choices)) return `index ${index}`;
	for (const choice of branch.choices) {
		if (!isJsonObject(choice)) continue;
		if (numberAt(choice, "index") !== index) continue;
		return stringAt(choice, "label") ?? `index ${index}`;
	}
	return `index ${index}`;
};

/** The readable projection. Every field here is a function of the bytes. */
const project = (container: SaveContainer): JsonValue => {
	const found = locateWritable(container.data);
	const saveVersion = readSaveVersion(container.data);
	// One object tree and one token walk, shared by every reader below.
	//
	// Measured on the large fixture: the walk is 834 ms and the tree build 246 ms,
	// against 1,081 / 280 / 492 ms that four readers each walking for themselves
	// cost on top of it. Everything downstream is handed these rather than
	// recomputing them.
	const entityRoots = readObjectTree(container.data).roots;
	const dialogueRead = readDialogues(
		container.data,
		found.scan.names,
		found.scan.tokens,
		entityRoots,
	);
	const skill = found.points.find((p) => p.kind === "skill");
	const experience = found.points.find((p) => p.kind === "exp");
	// Read once for both quest views. `readFactDB` scans for the `SBDF` magic and
	// then walks every declared record, so calling it twice is two full passes over
	// 3,997 records on the large fixture for one answer.
	const facts = readFactDB(container.data);
	// The journal needs the object tree's roots and the name table, both of which
	// the other readers have already paid for; passing them keeps this read to the
	// ~27 ms of span walking instead of another 246 ms tree build and 98 ms name
	// read.
	const journal = readJournal(container.data, {
		names: found.scan.names,
		roots: entityRoots,
	});

	return {
		format: ID,
		game: "The Witcher 3: Wild Hunt",
		container: {
			chunks: container.chunks.length,
			headerSize: container.headerSize,
			payloadBytes: container.data.length,
			// Deliberately absent: the file's compressed size. Re-encoding does
			// not reproduce the game's exact LZ4 output, so that number is
			// different on every rebuild even with no edits at all — and a field
			// that moves on every rebuild is exactly what the workbench's
			// round-trip check reads as an unsound file. The payload length, the
			// chunk count and the header size are all stable under a width-
			// preserving edit, so those are safe to show.
		},
		// The save's own `SAV3` version, read from the header rather than inferred
		// from what this editor happens to recognise.
		//
		// This key was `build`, holding `found.money === undefined ?
		// "unrecognised" : "52586"` — on the reasoning that finding the Next-Gen
		// crowns record identified the game build. That conflated two different
		// things and became visibly wrong once the inventory reader learned to
		// recover each build's record tag pair (`./inventory`): the second fixture
		// is build `8559a`, reads its wallet perfectly well, and was still labelled
		// "unrecognised" because it does not use `52586`'s item identity. A build
		// this codec cannot name is not a save it cannot read.
		//
		// Nor is the build recoverable from the file at all: the three `u32`
		// typecodes at offsets 4, 8 and 12 are the save format version
		// (`66/29/164` on both fixtures, which are two different builds), and the
		// build id appears only in the filename. See `./inner`.
		saveVersion,
		level: found.level?.value ?? null,
		difficulty: {
			index: found.difficulty?.value ?? null,
			// Deliberately no `name` here. It is derived from `index` and this
			// save's `choices`, so storing it would be a second document field
			// over one underlying fact: setting `index` to another difficulty left
			// `name` reading "Hard" while the file said "Easy", and the round-trip
			// check called the rebuild unsound. Measured, then removed. The label
			// is computed where it is needed, in `summarise`.
			//
			// This is the same mistake as exposing both `money` and the Crowns
			// item's quantity, and it has the same fix: a derived value does not
			// belong in the document.
			// The difficulties this build knows, with the `MANU` index each is
			// written as. Carried in the document rather than looked up at action
			// time so the quick actions can resolve an index from the save alone,
			// and so the two are guaranteed to agree: both come from this build's
			// own name table, and the round-trip check compares them.
			choices: (found.difficulty?.choices ?? []).map((choice) => ({
				label: choice.label,
				index: choice.index,
			})),
		},
		skillPoints: skill
			? {
					// `null` when the save does not carry the field at all: a zero is
					// omitted by the game, so there is no byte to write and a staged
					// edit would read back differently.
					free: skill.freeOffset > 0 ? skill.free : null,
					used: skill.used,
				}
			: null,
		experience: experience
			? {
					free: experience.freeOffset > 0 ? experience.free : null,
					used: experience.used,
				}
			: null,
		// The wallet is not a separate field. It is the `u16` quantity of the
		// `Crowns` item, so exposing it twice — once as `money` and once here —
		// would be two document fields over one pair of bytes, and editing either
		// would silently disagree with the other. Measured: with both fields,
		// setting `money` to 50000 left `items[Crowns]` reading 2996, and the
		// round-trip check correctly called the rebuild unsound. One field, one
		// byte.
		items: found.items.map((item) => ({
			name: item.name,
			quantity: item.quantity,
			slot: item.slot,
			// `null` when the item has no durability — the engine's own `-1.0`
			// sentinel, not a missing field. Reported because requiring `-1.0` to
			// *recognise* the record used to drop every damaged item: 11 of this
			// save's 626, the player's own sword and armour among them.
			durability: item.durability,
		})),
		// Every *other* container's items — actors, merchants, chests — with the
		// owner's community name where the save records one (`keira_metz`, …), so a
		// merchant's or NPC's stock is readable rather than a bare offset. The
		// player's list is `items` above; including it here would be two document
		// fields over one list, which the round-trip check would rightly reject.
		containers: readContainers(container.data)
			.filter((c) => c.label !== "player" && c.items.length > 0)
			.map((c) => ({
				label: c.label,
				items: c.items.map((item) => ({
					name: item.name,
					quantity: item.quantity,
				})),
			})),
		position: (() => {
			const player = readPlayer(container.data);
			return player === undefined
				? null
				: { template: player.template, x: player.x, y: player.y, z: player.z };
		})(),
		quests: (() => {
			if (facts === undefined) return [];
			// Sorted by title so the list reads as a journal rather than as the
			// order the engine happened to write its facts in, and capped because
			// a late-game save holds hundreds: the summary row carries the true
			// count and the tree view carries the rest.
			// The journal's own answer per quest id, joined here so a caller can
			// read one row's two sources side by side. `null` where the journal has
			// no entry for the quest: absence, not a verdict — 17 of 43 rows on
			// `52586` and 3 of 10 on `8559a` are in that state, and a UI that
			// cannot tell "the journal says nothing" from "the journal says the
			// quest is not done" is exactly the confusion this field exists to
			// remove.
			const rollupById = new Map(
				journal.quests.map((quest) => [quest.id, quest.rollup]),
			);
			return questProgress(facts.facts)
				.map((q) => ({
					id: q.id,
					title: questTitle(q.id) ?? q.id,
					// Named for where it comes from rather than what it is: this is
					// the `_done` / `_failed` / `_accepted` **fact-name** heuristic in
					// `./quests`, not the game's record of the quest. It disagrees
					// with the journal on 2 of 7 comparable quests here and 7 of 26
					// on the larger fixture, always the same way round.
					inferredState: q.state,
					journalStatus: rollupById.get(q.id) ?? null,
					done: q.done,
					total: q.total,
				}))
				.sort((a, b) => a.title.localeCompare(b.title))
				.slice(0, 200);
		})(),
		// The per-step detail behind `quests`, from the same fact DB, so it is the
		// heuristic's evidence rather than a second reading: `inferredState` above
		// is derived from these very records.
		questSteps:
			facts === undefined
				? []
				: questStepDetail(facts.facts)
						.slice(0, 60)
						.map((quest) => ({
							id: quest.id,
							// `null` rather than the raw id echoed back: 10 of 43 quest
							// ids on the large fixture resolve to no title, and a UI that
							// cannot tell "no title known" from "the title is mq1036" renders
							// the id as though it were the game's own wording.
							title: quest.title ?? null,
							stepsTotal: quest.stepsTotal,
							stepsFired: quest.stepsFired,
							events: quest.events,
							stepsDropped: quest.stepsDropped,
							steps: quest.steps,
							stepNameSample: quest.stepNameSample,
							stepNamesSampledOut: quest.stepNamesSampledOut,
							eventTimeSample: quest.eventTimeSample,
							eventTimesSampledOut: quest.eventTimesSampledOut,
						})),
		// Every skill in the array, including the ones with no level field, so this
		// list's indices line up one-for-one with the save's. Filtering the
		// un-level-bearing entries out would shift every index after the first of
		// them, and `encode` addresses skills by index — so a filtered list would
		// write a level onto the *wrong* skill. 148 of 167 carry a level; the other
		// 19 omit it (a field at its default is not written to the stream) and
		// report `null`, which is the honest answer rather than a zero that looks
		// editable.
		skills: found.skills.map(
			(s): SkillRow => ({
				name: s.name,
				level: s.level ?? null,
				// Carried so the action can cap each skill at its own ceiling. It is
				// a fact about the save, not a constant, so it belongs in the
				// document; the round-trip check then holds the two in agreement.
				maxLevel: s.maxLevel ?? null,
			}),
		),
		// The Blood-and-Wine mutation catalogue, read-only. The full twelve plus
		// `EPMT_MutationMaster` are always present (the save stores the catalogue,
		// not just the learned entries), so `progress` is what says how far each
		// one is. `nameKey` is the `w3strings` key for the display name; the text
		// itself is in the game's localisation, not in the save.
		mutations: found.mutations.map(
			(m): MutationRow => ({
				name: m.name ?? null,
				colors: m.colors,
				progress:
					m.progress === undefined
						? null
						: Object.fromEntries(
								Object.entries(m.progress).map(([key, value]) => [
									key,
									value ?? null,
								]),
							),
				requiredMutations: m.requiredMutations,
				nameKey: m.localizationNameKey ?? null,
				label:
					m.localizationNameKey === undefined
						? null
						: (localizedString(m.localizationNameKey) ?? null),
			}),
		),
		equippedMutation: found.equippedMutation ?? null,
		// The read-only character sheet. Every field here is a function of the
		// bytes: a name resolved through this save's own `MANU` table, and a
		// multiplier read off the reflected struct.
		//
		// What is *not* here is experience-to-next-level, which is derived from
		// `levelCurve` plus the two experience fields. It is computed in
		// `summarise` instead, because a figure no byte in the file states would
		// be a second thing for the document to be right about — the same
		// reasoning that removed `difficulty.name`.
		stats: {
			baseStats: found.stats.baseStats,
			resistances: found.stats.resistances,
			levelCurve: found.stats.levelCurve,
		},
		// The four read-only features below all read the same decompressed stream
		// and all want the same token walk, so `locateWritable`'s scan is handed to
		// each rather than letting four readers walk 250,640 tokens apiece. Measured
		// on the large fixture: 834 ms for the walk these share, against 1,081 /
		// 280 / 492 ms that four private walks cost on top of it.
		//
		// `readDialogues` and `readEntityFlags` also read the object's span index,
		// which no one else needs, so that cost stays.
		//
		// The **authoritative** quest state. `inferredState` on each row of
		// `quests` above is the fact-name heuristic; this is the game's own
		// journal, and the two disagree on roughly a quarter of comparable quests
		// (2 of 7 on 8559a, 7 of 26 on 52586, measured). Every disagreement runs the
		// same way — the journal records `JS_Success`, the heuristic says in
		// progress — so the site was under-reporting completion.
		//
		// It is a **partial** view and must not be read as "the quests": 17 of 43
		// fact-side quests on 52586 have no journal entry at all, and 650 of 972
		// entries have an empty head resource so no quest can be attributed to them.
		// Both counts are in the branch rather than glossed over.
		journal: {
			entries: journal.entries,
			// A list of `{ status, entries }` rows rather than three named fields,
			// so a fourth `JS_*` name a future build carries is reported rather than
			// silently dropped. `JS_Failed` is exactly that case: absent from the
			// smaller fixture's name table entirely, and present 7 times here.
			statuses: journal.statuses,
			unattributed: journal.unattributed,
			questCount: journal.questCount,
			quests: journal.quests.map((quest) => ({
				id: quest.id,
				// `null`, never the id echoed back: a UI that cannot tell "no title
				// known" from "the title is mq1036" shows the id as the game's own
				// wording. Every journal-side id resolves on both fixtures; the
				// catalogue's gaps are on the fact side (10 of 43 there).
				title: quest.title ?? null,
				entries: quest.entries,
				statuses: quest.statuses,
				// The precedence-resolved label. `contested` is the signal that a
				// precedence was applied over conflicting entries — `mq0003` is
				// `JS_Success` *and* `JS_Active` — so a caller that would rather
				// render both can see that it has to.
				rollup: quest.rollup,
				contested: quest.contested,
			})),
			collections: journal.collections,
			sample: journal.sample.map((entry) => ({
				// `null` for an unattributable entry, per the same rule as a quest
				// title. The status is still recorded even when the quest is not.
				questId: entry.questId ?? null,
				status: entry.status,
			})),
			sampleTruncated: journal.sampleTruncated,
		},
		dialogues: dialogueRead.dialogs,
		attitudes: dialogueRead.attitudes,
		unlocks: readUnlocksFromScan(
			container.data,
			found.scan.names,
			found.scan.tokens,
		),
		entities: readEntityFlags(
			container.data,
			found.scan.names,
			found.scan.tokens,
			entityRoots,
		),
		// The branch the scaffold rides on. Present but empty as far as
		// `JSON.stringify` is concerned, which is what keeps the round-trip
		// comparison honest.
		[SCAFFOLD_KEY]: {},
	};
};

const decode = async (bytes: Bytes): Promise<JsonValue> => {
	let container: SaveContainer;
	try {
		container = decompressContainer(bytes);
	} catch (cause) {
		throw new Error(
			`This does not look like a Witcher 3 save: ${describeError(cause)}`,
		);
	}
	if (container.chunks.length === 0) {
		throw new Error("The save has no content chunks.");
	}
	const doc = project(container);
	attachScaffold(doc, {
		payload: container.data,
		chunks: container.chunks.map((c) => ({ ...c })),
	});
	return doc;
};

/** Read a scalar the document exposes, or `undefined` when it is absent. */
const scalarOf = (doc: JsonValue, key: string): number | undefined => {
	const value = numberAt(doc, key);
	return value === undefined || value === null ? undefined : value;
};

/**
 * The carried item whose record flags a new item should clone, by shared words.
 * `Greater mutagen red` picks `Greater mutagen blue`; when nothing shares a word
 * it falls back to the first item, which is what the record's non-name bytes
 * mostly are anyway.
 */
const templateFor = (
	name: string,
	items: readonly { readonly name: string }[],
): string | undefined => {
	const words = new Set(name.toLowerCase().split(/\s+/));
	let best: { name: string; score: number } | undefined;
	for (const item of items) {
		const score = item.name
			.toLowerCase()
			.split(/\s+/)
			.filter((word) => words.has(word)).length;
		if (best === undefined || score > best.score) {
			best = { name: item.name, score };
		}
	}
	return best?.name;
};

const encode = async (doc: JsonValue): Promise<Bytes> => {
	const scaffold = readScaffold(doc);
	if (scaffold === undefined) {
		throw new Error(
			"This document has no save attached to it. Re-open the file — the inspector cannot rebuild a save from its own projection.",
		);
	}

	// Re-derive every address from the payload rather than trusting one from
	// the document: the offsets are per-save and cannot survive being stored.
	let payload = scaffold.payload.slice();
	let chunks = scaffold.chunks;
	let found = locateWritable(payload);

	// "Max all mutations" is a resize, not a value patch: the `*Used` fields the
	// engine recomputes from are absent at 0, so they have to be inserted. When
	// the document asks for more than the save has, rebuild the ability manager
	// first and re-derive every offset from the grown payload.
	const requestedMutations = requireArrayAt(doc, "mutations");
	const wantsMutationResize = found.mutations.some((mutation, index) => {
		const row = requestedMutations[index];
		if (row === undefined || !isJsonObject(row)) return false;
		const progress = objectAt(row, "progress");
		if (progress === undefined) return false;
		return ["redUsed", "blueUsed", "greenUsed", "skillpointsUsed"].some(
			(key) =>
				(numberAt(progress, key) ?? 0) !== (mutation.progress?.[key] ?? 0),
		);
	});
	if (wantsMutationResize) {
		const resized = maxMutationsInPayload({ data: payload, chunks });
		payload = resized.data;
		chunks = resized.chunks;
		found = locateWritable(payload);
	}

	const apply = (target: PatchableScalar | undefined, key: string): void => {
		if (target === undefined) return;
		const wanted = scalarOf(doc, key);
		if (wanted === undefined) return;
		patchScalar(payload, target, wanted);
	};

	apply(found.level, "level");

	if (found.difficulty !== undefined) {
		const difficulty = objectAt(doc, "difficulty");
		const index =
			difficulty === undefined ? undefined : numberAt(difficulty, "index");
		if (index !== undefined && index !== null) {
			patchScalar(payload, found.difficulty, index);
		}
	}

	// Both counters live in one small array, so the lookup is built once rather
	// than searched again per iteration: `points` is walked as a map, not as a
	// list, so the cost does not grow with however many counters a save carries.
	const counters = new Map(found.points.map((p) => [p.kind, p]));
	for (const [key, kind] of [
		["skillPoints", "skill"],
		["experience", "exp"],
	] as const) {
		const branch = objectAt(doc, key);
		const points = counters.get(kind);
		if (branch === undefined || points === undefined) continue;
		const free = numberAt(branch, "free");
		const used = numberAt(branch, "used");
		if (free !== undefined && free !== null) {
			writeInt32(payload, points.freeOffset, free);
		}
		if (used !== undefined && used !== null && points.usedOffset > 0) {
			writeInt32(payload, points.usedOffset, used);
		}
	}

	const items = requireArrayAt(doc, "items");
	// Rows the save does not have yet are inserts, and the writer appends them at
	// the end of the list, so the existing rows are still first.
	const newCount = Math.max(0, items.length - found.items.length);
	found.items.forEach((item, index) => {
		const row = items[index];
		// `objectAt(row, "")` looks up a key named "" and silently yields
		// `undefined` for every row, which made this loop a no-op that still
		// looked like it was writing quantities.
		if (row === undefined || !isJsonObject(row)) return;
		const quantity = numberAt(row, "quantity");
		if (quantity === undefined || quantity === null) return;
		writeUint16(payload, item.quantityOffset, quantity);
	});

	// Skill levels. Each is a 4-byte `Int32` inside an element that is already in
	// the array, so overwriting one changes no length — which is the whole basis
	// for being able to write it at all (ADR-0007). A skill with no level field is
	// skipped: the field is absent from the stream, and adding one would move
	// every offset after it.
	const skills = requireArrayAt(doc, "skills");
	found.skills.forEach((skill, index) => {
		if (skill.levelOffset === undefined || skill.levelOffset <= 0) return;
		const row = skills[index];
		if (row === undefined || !isJsonObject(row)) return;
		const level = numberAt(row, "level");
		if (level === undefined || level === null) return;
		writeInt32(payload, skill.levelOffset, level);
	});

	// Mutations. Every present `SMutationProgress` field is an `Int32` already in
	// the stream, so writing one changes no length. Only fields that are present
	// have an offset: a `*Used` field at 0 is not serialised, but
	// `overallProgress` is (as -1), and the engine returns it directly once it is
	// `>= 0` — which is what "researched" means and what the max action writes.
	const mutations = requireArrayAt(doc, "mutations");
	found.mutations.forEach((mutation, index) => {
		const row = mutations[index];
		const offsets = mutation.progressOffsets;
		if (row === undefined || !isJsonObject(row) || offsets === undefined)
			return;
		const progress = objectAt(row, "progress");
		if (progress === undefined) return;
		for (const [key, offset] of Object.entries(offsets)) {
			const value = numberAt(progress, key);
			if (value === undefined || value === null) continue;
			writeInt32(payload, offset, value);
		}
	});

	if (newCount > 0) {
		const requests: {
			name: string;
			quantity: number;
			template: string | undefined;
		}[] = [];
		for (let index = found.items.length; index < items.length; index += 1) {
			const row = items[index];
			if (row === undefined || !isJsonObject(row)) continue;
			const name = stringAt(row, "name");
			if (name === undefined) continue;
			requests.push({
				name,
				quantity: numberAt(row, "quantity") ?? 1,
				template: templateFor(name, found.items),
			});
		}
		if (requests.length > 0) {
			const added = addItemsToPayload({ data: payload, chunks }, requests);
			return buildContainer(added.chunks, added.data) as Bytes;
		}
	}

	const rebuilt = buildContainer(chunks, payload);
	return rebuilt as Bytes;
};

const writeInt32 = (data: Uint8Array, at: number, value: number): void => {
	if (at <= 0 || at + 4 > data.length) return;
	new DataView(data.buffer, data.byteOffset + at, 4).setInt32(
		0,
		Math.trunc(value),
		true,
	);
};

const writeUint16 = (data: Uint8Array, at: number, value: number): void => {
	if (at <= 0 || at + 2 > data.length) return;
	const clamped = Math.min(0xffff, Math.max(0, Math.trunc(value)));
	data[at] = clamped & 0xff;
	data[at + 1] = (clamped >>> 8) & 0xff;
};

/**
 * The document's XP curve, read back as typed rows.
 *
 * The document is a `JsonValue` and cannot be handed to `experienceToNextLevel`,
 * which needs the curve's numbers rather than arbitrary JSON. Every row is
 * narrowed by hand and a row missing its level is dropped — a curve row with no
 * `level` cannot be looked up by one, and passing it on would mean looking up the
 * wrong row rather than failing to find one.
 *
 * The inverse of `project`, and the reason `LevelDefinition` is a plain type of
 * three numbers: it survives the round trip through JSON without a cast.
 */
const readLevelCurveAt = (doc: JsonValue): readonly LevelDefinition[] => {
	const stats = objectAt(doc, "stats");
	if (stats === undefined) return [];
	const rows = arrayAt(stats, "levelCurve") ?? [];
	const curve: LevelDefinition[] = [];
	for (const row of rows) {
		if (!isJsonObject(row)) continue;
		const level = numberAt(row, "level");
		if (level === undefined || level === null) continue;
		curve.push({
			level,
			requiredTotalExp: numberAt(row, "requiredTotalExp") ?? null,
			addedSkillPoints: numberAt(row, "addedSkillPoints") ?? null,
		});
	}
	return curve;
};

/**
 * The Crowns row, which is the wallet.
 *
 * Reads `items` with the defensive `arrayAt`, not the throwing `requireArrayAt`,
 * because this is reached from `summarise` — whose whole documented contract is
 * that an absent field produces no row rather than an error. With the throwing
 * reader, `summarise` crashed on any document that had lost `items` ("`items`
 * must be an array") instead of reporting the wallet as unsupported, which is the
 * honest answer it already prints for a build whose wallet record it cannot find.
 *
 * `encode` and the quick actions still use the throwing reader on purpose: they
 * *write*, and a document missing the list they write into is one they must
 * refuse rather than silently half-apply.
 */
const crownsRow = (
	doc: JsonValue,
): { path: (string | number)[]; quantity: number } | undefined => {
	const list = arrayAt(doc, "items") ?? [];
	for (const [index, row] of list.entries()) {
		if (!isJsonObject(row)) continue;
		if (stringAt(row, "name") !== "Crowns") continue;
		const quantity = numberAt(row, "quantity");
		if (quantity === undefined || quantity === null) continue;
		return { path: ["items", index, "quantity"], quantity };
	}
	return undefined;
};

/**
 * What one `inferredState` value would look like in the journal's vocabulary.
 *
 * Two independent vocabularies for one question, so a disagreement count needs
 * a stated translation rather than `!==`: the heuristic says `in-progress` where
 * the journal says `active`, and on the fixtures that pairing is agreement, not
 * conflict — 7 of the 26 comparable quests on `52586` are exactly that. Counting
 * them as disagreements would overstate the gap by more than a third.
 *
 * `not-started` maps to `inactive` on the same reasoning. Neither fixture
 * produces that pair (every quest the fact DB groups has at least one non-zero
 * fact), so the mapping is stated rather than measured.
 */
const JOURNAL_EQUIVALENT: Readonly<Record<string, string>> = {
	completed: "succeeded",
	failed: "failed",
	active: "active",
	"in-progress": "active",
	"not-started": "inactive",
};

/**
 * The journal's figures, and the disagreement count, from the document alone.
 *
 * Returned separately from `summarise` so the comparison it needs — each quest
 * row's `inferredState` against its own `journalStatus` — is read from the
 * document and never re-derived from the readers, which is what keeps the round
 * trip honest.
 */
const questSummaryRows = (doc: JsonValue): readonly SummaryRow[] => {
	const journal = objectAt(doc, "journal");
	// No rows at all rather than rows of zeros, and not even a row saying "not in
	// this save": a document without the branch is one the inspector has edited,
	// and `summarise`'s existing rule for that is to omit rather than state —
	// "0 quests recorded" would be a claim about the player's progress nothing
	// supports. Measured against a save this codec decodes, the branch is always
	// present.
	if (journal === undefined) return [];
	const questRows = arrayAt(doc, "quests") ?? [];
	let comparable = 0;
	let disagree = 0;
	let succeeded = 0;
	let recorded = 0;
	for (const quest of arrayAt(journal, "quests") ?? []) {
		if (!isJsonObject(quest)) continue;
		recorded += 1;
		if (stringAt(quest, "rollup") === "succeeded") succeeded += 1;
	}
	for (const row of questRows) {
		if (!isJsonObject(row)) continue;
		const status = stringAt(row, "journalStatus");
		// No journal entry is absence of an answer, not an answer of absence, so
		// those rows are excluded from the comparison rather than counted as
		// agreement.
		if (status === undefined) continue;
		comparable += 1;
		const inferred = stringAt(row, "inferredState");
		if (inferred !== undefined && JOURNAL_EQUIVALENT[inferred] !== status) {
			disagree += 1;
		}
	}
	return [
		{
			label: "Quests in journal",
			value: `${recorded} recorded, ${succeeded} succeeded`,
		},
		{
			label: "Journal vs inferred state",
			value:
				comparable === 0
					? "no quest in both readings"
					: disagree === 0
						? `agree on all ${comparable}`
						: `disagree on ${disagree} of ${comparable}`,
			// Worth noticing exactly when the two sources conflict: that is the
			// figure the heuristic alone would have hidden.
			emphasis: disagree > 0,
		},
	];
};

const summarise = (doc: JsonValue): readonly SummaryRow[] => {
	const crowns = crownsRow(doc);
	const money = crowns?.quantity;
	const level = scalarOf(doc, "level");
	const rows: SummaryRow[] = [
		{
			// The `SAV3` version, so the label says what the value is. It used to
			// read "Build" over a value that was a game build id, which the file
			// does not contain.
			label: "Save version",
			value: requireStringAt(doc, "saveVersion"),
		},
		{
			label: "Level",
			value: level === undefined ? "not found" : String(level),
			emphasis: level !== undefined && level < 20,
		},
		{ label: "Difficulty", value: difficultyLabel(doc) },
		{
			label: "Crowns",
			value:
				crowns === undefined
					? "not supported for this build"
					: String(crowns.quantity),
			// Worth noticing exactly when it is *missing*: the honest case is a
			// save this editor can read but cannot write money for.
			emphasis: money === undefined,
		},
	];

	const skillPoints = objectAt(doc, "skillPoints");
	if (skillPoints !== undefined) {
		const free = numberAt(skillPoints, "free");
		rows.push({
			label: "Skill points",
			value: free === undefined ? "not in this save" : `${free} free`,
		});
	}
	const experience = objectAt(doc, "experience");
	if (experience !== undefined) {
		const free = numberAt(experience, "free");
		rows.push({
			label: "Experience",
			value: free === undefined ? "not in this save" : `${free} available`,
		});
		// How much is still owed to the next level, from the save's own XP curve.
		//
		// Computed here rather than stored: no byte in the file states it, so a
		// stored copy would be a field the round-trip check compared against
		// itself. `experienceToNextLevel` answers `null` unless the curve, the
		// level and the counter agree, and a row that says so beats a guess.
		const toNext = experienceToNextLevel(
			readLevelCurveAt(doc),
			level === undefined ? null : level,
			experience === undefined
				? null
				: {
						free: free === undefined || free === null ? null : free,
						used: numberAt(experience, "used") ?? 0,
					},
		);
		rows.push({
			label: "To next level",
			value: toNext === null ? "not derivable" : `${toNext} XP`,
		});
	}
	const questRows = questSummaryRows(doc);
	rows.push(...questRows);

	const position = objectAt(doc, "position");
	if (position !== undefined) {
		const x = numberAt(position, "x");
		const y = numberAt(position, "y");
		const z = numberAt(position, "z");
		if (x !== undefined && y !== undefined && z !== undefined) {
			rows.push({
				label: "Position",
				value: `${x.toFixed(0)}, ${y.toFixed(0)}, ${z.toFixed(0)}`,
			});
		}
	}

	return rows;
};

/**
 * The one-click changes.
 *
 * Each `plan` is pure and returns the edits a button *would* stage, which is
 * what makes a cheat testable — a test can assert exactly what a button does,
 * which is the only part of it that matters. Returning `[]` is how an action
 * greys itself out, and that is what happens on a build whose money record this
 * editor cannot find: better a disabled button than one that would patch an
 * unrelated record.
 */
const edit = (
	path: readonly (string | number)[],
	label: string,
	before: number | string | null,
	after: number | string | null,
): SaveEdit => ({
	id: `${path.join(".")}=${after}`,
	label,
	path,
	before,
	after,
});

/**
 * The level "Max every skill" writes.
 *
 * A skill's level runs 0 (not learned) to 3 in this game, so 3 is the ceiling
 * and there is nothing above it to clamp against. It is a named constant rather
 * than a literal in three places because the action, its description and its
 * tests all quote it, and a change to the game's progression should be one edit
 * rather than three that can drift apart.
 *
 * Nothing here *enforces* the ceiling: the field is a plain `Int32` and will
 * hold any value. Writing 6 would work and would write a level the game does not
 * have, which is why the constant states the game's rule rather than the
 * format's tolerance.
 */
const MAX_SKILL_LEVEL = 3;

/**
 * Every skill in the save that carries a level, as `[index, current]` pairs.
 *
 * The indices are the document's, which line up one-for-one with the save's own
 * skill array — see the note on the projection. A skill whose level field is
 * absent from the stream is left out rather than reported as level 0: there are
 * 19 such skills in a real save, and claiming they are at 0 would offer to write
 * a field that does not exist, which needs a length change and would move every
 * offset after it.
 */
const levelBearing = (
	doc: JsonValue,
): readonly {
	index: number;
	name: string;
	level: number;
	maxLevel: number;
}[] => {
	const skills = requireArrayAt(doc, "skills");
	const out: {
		index: number;
		name: string;
		level: number;
		maxLevel: number;
	}[] = [];
	for (const [index, row] of skills.entries()) {
		if (!isJsonObject(row)) continue;
		const level = numberAt(row, "level");
		if (level === undefined || level === null) continue;
		// A skill with no `maxLevel` recorded caps at the game's ceiling. That is a
		// fallback rather than a guess: 148 of 148 skills in both fixtures carry
		// one, and a skill without it is not something this build produces.
		const cap = numberAt(row, "maxLevel");
		out.push({
			index,
			// Named so a staged edit reads "S_Sword_1" in the tray rather than
			// "Skill level" 148 times over, which would make the list unusable.
			name: stringAt(row, "name") ?? `skill ${index}`,
			level,
			maxLevel: cap === undefined || cap === null ? MAX_SKILL_LEVEL : cap,
		});
	}
	return out;
};

const ACTIONS: readonly QuickAction[] = [
	{
		id: "crowns-max",
		label: "Fill the wallet",
		description: "Set crowns to the most the field can hold (65535).",
		plan: (doc) => {
			const crowns = crownsRow(doc);
			if (crowns === undefined) return [];
			return [edit(crowns.path, "Crowns", crowns.quantity, 65535)];
		},
	},
	{
		id: "crowns-round",
		label: "Round to 1000",
		description: "Round crowns up to the next thousand.",
		plan: (doc) => {
			const crowns = crownsRow(doc);
			if (crowns === undefined || crowns.quantity >= 65535) return [];
			const next = Math.min(
				65535,
				Math.ceil((crowns.quantity + 1) / 1000) * 1000,
			);
			if (next === crowns.quantity) return [];
			return [edit(crowns.path, "Crowns", crowns.quantity, next)];
		},
	},
	{
		id: "skill-points-max",
		label: "Max skill points",
		description: "Set unspent skill points to 500.",
		plan: (doc) => {
			const branch = objectAt(doc, "skillPoints");
			if (branch === undefined) return [];
			const free = numberAt(branch, "free");
			if (free === undefined || free === null || free === 500) return [];
			return [edit(["skillPoints", "free"], "Skill points", free, 500)];
		},
	},
	{
		id: "mutation-research-kit",
		label: "Stock mutation research",
		description:
			"Set unspent skill points to 500 and top every mutagen you carry up to 50. Lab research consumes Greater mutagens (normal and lesser carry no research points) plus skill points, so this stocks the colours you already hold at least one Greater mutagen of — the editor cannot add an item the save does not contain.",
		plan: (doc) => {
			const edits: SaveEdit[] = [];
			const points = objectAt(doc, "skillPoints");
			const free = points === undefined ? undefined : numberAt(points, "free");
			if (free !== undefined && free !== null && free < 500) {
				edits.push(edit(["skillPoints", "free"], "Skill points", free, 500));
			}
			const items = requireArrayAt(doc, "items");
			for (const [index, row] of items.entries()) {
				if (!isJsonObject(row)) continue;
				const name = stringAt(row, "name") ?? "";
				// A mutagen ingredient, not the "Recipe for Mutagen N" items whose
				// names also contain "Mutagen".
				if (!/mutagen/i.test(name) || /recipe/i.test(name)) continue;
				const quantity = numberAt(row, "quantity");
				if (quantity === undefined || quantity === null || quantity >= 50) {
					continue;
				}
				edits.push(edit(["items", index, "quantity"], name, quantity, 50));
			}
			return edits;
		},
	},
	{
		id: "mutations-max",
		label: "Max all mutations",
		description:
			"Fully research every Blood-and-Wine mutation. The engine recomputes progress from the four *Used counters, so this inserts each Used field (= its Required) into the save and sets progress to 100 — exactly what the game's own console `mutall` does. Resizing: it adds the fields, so the file grows.",
		plan: (doc) => {
			const mutations = requireArrayAt(doc, "mutations");
			const edits: SaveEdit[] = [];
			const colors = new Set<string>();
			let inserts = 0;
			mutations.forEach((row, index) => {
				if (!isJsonObject(row)) return;
				const progress = objectAt(row, "progress");
				if (progress === undefined) return;
				const name = stringAt(row, "name") ?? `mutation ${index}`;
				// `EPMT_MutationMaster` is derived from how many other mutations
				// are researched, and the game itself writes no `*Used` for it.
				if (name === "EPMT_MutationMaster") return;
				for (const color of ["red", "blue", "green", "skillpoints"]) {
					const required = numberAt(progress, `${color}Required`);
					if (required === undefined || required === null || required <= 0) {
						continue;
					}
					const used = numberAt(progress, `${color}Used`) ?? 0;
					if (used >= required) continue;
					edits.push(
						edit(
							["mutations", index, "progress", `${color}Used`],
							`${name} ${color}`,
							used,
							required,
						),
					);
					inserts += 1;
					colors.add(color);
				}
				const overall = numberAt(progress, "overallProgress");
				if (overall !== undefined && overall !== null && overall < 100) {
					edits.push(
						edit(
							["mutations", index, "progress", "overallProgress"],
							`${name} progress`,
							overall,
							100,
						),
					);
				}
			});
			// Every `*Used` is a new 12-byte field, and any colour used at least
			// once appends its name to `MANU`. The document carries the payload
			// size, so it has to predict the growth or the rebuild reads back a
			// length the edits did not.
			if (inserts > 0) {
				// The active mutation goes with it: a maxed save without
				// `equippedMutation` is the one the engine refuses, and the game's
				// own `mutall` equips as it maxes. It is a 10-byte enum record
				// (8-byte header + a 2-byte value) plus its name in `MANU`, and it
				// is absent from the save unless the player already equipped one.
				const equipped = stringAt(doc, "equippedMutation");
				let equipAdded = 0;
				if (equipped !== "EPMT_MutationMaster") {
					edits.push(
						edit(
							["equippedMutation"],
							"Equipped mutation",
							equipped ?? null,
							"EPMT_MutationMaster",
						),
					);
					// Nothing in the save means the field has to be created, which
					// costs the record and its `MANU` entry; an existing field is
					// only its 2-byte value that changes.
					if (equipped === undefined) {
						equipAdded = 10 + 1 + "equippedMutation".length;
					}
				}
				const added =
					inserts * 12 +
					equipAdded +
					[...colors].reduce(
						(sum, color) => sum + 1 + `${color}Used`.length,
						0,
					);
				const container = objectAt(doc, "container");
				const payloadBytes =
					container === undefined
						? undefined
						: numberAt(container, "payloadBytes");
				if (payloadBytes !== undefined && payloadBytes !== null) {
					edits.push(
						edit(
							["container", "payloadBytes"],
							"Payload size",
							payloadBytes,
							payloadBytes + added,
						),
					);
				}
			}
			return edits;
		},
	},
	{
		id: "mutagens-greater",
		label: "Add Greater mutagens",
		description:
			"Insert 50 Greater red, green and blue mutagens at the top of the player's inventory. This is the editor's one resizing edit: it inserts real records rather than changing a value, so the file grows.",
		plan: (doc) => {
			const items = requireArrayAt(doc, "items");
			const named = items
				.filter(isJsonObject)
				.map((row) => ({ row, name: stringAt(row, "name") ?? "" }));
			const rows = [
				"Greater mutagen red",
				"Greater mutagen green",
				"Greater mutagen blue",
			].map((name) => {
				const template = named.find(
					(entry) => entry.name === templateFor(name, named),
				);
				return {
					name,
					quantity: 50,
					slot:
						template === undefined ? 0 : (numberAt(template.row, "slot") ?? 0),
					// `addItemsToPayload` clones the template's record wholesale, so
					// the durability field it copies is the *template's*, not the new
					// item's. A mutagen has none, and the inserted record's field is
					// the template's `f32 -1.0`, so this is the value the rebuild will
					// read — and the document has to say it or the round trip reports a
					// difference that was never a difference in the file.
					durability: numberAt(template?.row ?? null, "durability") ?? null,
				};
			});
			const edits: SaveEdit[] = [
				{
					id: "items=add-greater-mutagens",
					label: "Add Greater mutagens",
					path: ["items"],
					before: items,
					after: [...items, ...rows],
				},
			];
			// The insert grows the decompressed stream, and `container.payloadBytes`
			// is a projection of exactly that, so the document has to say the new
			// size or the rebuild reads back a length the edits did not predict.
			const container = objectAt(doc, "container");
			const payloadBytes =
				container === undefined
					? undefined
					: numberAt(container, "payloadBytes");
			if (payloadBytes !== undefined && payloadBytes !== null) {
				const added =
					rows.length * 30 +
					rows.reduce((sum, row) => sum + 1 + row.name.length, 0);
				edits.push(
					edit(
						["container", "payloadBytes"],
						"Payload size",
						payloadBytes,
						payloadBytes + added,
					),
				);
			}
			return edits;
		},
	},
	{
		id: "experience-max",
		label: "Max experience",
		description: "Set available experience to 500.",
		plan: (doc) => {
			const branch = objectAt(doc, "experience");
			if (branch === undefined) return [];
			const free = numberAt(branch, "free");
			if (free === undefined || free === null || free === 500) return [];
			return [edit(["experience", "free"], "Experience", free, 500)];
		},
	},
	{
		id: "skills-learn-all",
		label: "Max every skill",
		description: `Set every skill in this save to its own maximum — level ${MAX_SKILL_LEVEL} at the top of the tree, less for the skills that cap lower. Each level is a 4-byte value already present in the save, so this resizes nothing.`,
		plan: (doc) => {
			const skills = levelBearing(doc);
			if (skills.length === 0) return [];
			// Each skill is written to *its own* ceiling rather than a blanket 3.
			// Measured on a real save: 39 skills cap at 1, three at 2 and 106 at 3,
			// so writing 3 to all of them would push 42 past the maximum the game
			// itself records for them.
			//
			// Only the ones that would change: staging 148 edits to write the value
			// a skill already holds would put a wall of no-ops in the tray.
			return skills
				.filter((skill) => skill.level !== skill.maxLevel)
				.map((skill) =>
					edit(
						["skills", skill.index, "level"],
						skill.name,
						skill.level,
						skill.maxLevel,
					),
				);
		},
	},
	{
		id: "skills-reset",
		label: "Reset every skill",
		description: "Set every skill in this save back to level 0.",
		plan: (doc) => {
			const skills = levelBearing(doc);
			if (skills.length === 0) return [];
			return skills
				.filter((skill) => skill.level !== 0)
				.map((skill) =>
					edit(
						["skills", skill.index, "level"],
						"Skill level",
						skill.level ?? 0,
						0,
					),
				);
		},
	},
	{
		id: "level-up",
		label: "Level up",
		description: "Add five levels, up to what the save's own curve allows.",
		plan: (doc) => {
			const level = scalarOf(doc, "level");
			if (level === undefined || level >= 60) return [];
			return [edit(["level"], "Level", level, Math.min(60, level + 5))];
		},
	},
];

/**
 * A "Play on X" action per difficulty the game is known to have.
 *
 * Difficulty is a `u16` holding a `MANU` index, not an enum ordinal, and there is
 * no global list of indices: they differ per game build. Measured — build `52586`
 * knows Easy/NotSet/Medium/Hard while `8559a` knows Hardcore/NotSet, with *no
 * overlap* on Hardcore. So each action looks its own index up in the save's own
 * name table at plan time and stages nothing when that build has never heard of
 * the difficulty, which is what greys the button out.
 *
 * The action list is necessarily fixed — `SaveCodec.actions` is a static array —
 * and these are actions rather than a dropdown because the shared workbench is a
 * generic JSON inspector with no notion of an enum. Adding one would mean forking
 * a variant into `src/shared/` for every save editor on the site, which AGENTS.md
 * explicitly warns against. An action is the contract's own vocabulary, and its
 * `plan` is pure, so "which difficulties can this save reach" is asserted in a
 * test rather than merely rendered.
 */
const DIFFICULTIES = ["Easy", "Medium", "Hard", "Hardcore", "NotSet"] as const;

const difficultyIndexFor = (
	doc: JsonValue,
	label: string,
): number | undefined => {
	const branch = objectAt(doc, "difficulty");
	if (branch === undefined || !Array.isArray(branch.choices)) return undefined;
	for (const choice of branch.choices) {
		if (!isJsonObject(choice)) continue;
		if (stringAt(choice, "label") !== label) continue;
		const index = numberAt(choice, "index");
		if (index === undefined) continue;
		return index;
	}
	return undefined;
};

const difficultyActions: readonly QuickAction[] = DIFFICULTIES.map((label) => ({
	id: `difficulty-${label.toLowerCase()}`,
	label: `Play on ${label}`,
	description: `Set the difficulty to ${label}.`,
	plan: (doc) => {
		const index = difficultyIndexFor(doc, label);
		if (index === undefined) return [];
		const branch = objectAt(doc, "difficulty");
		const current =
			branch === undefined ? undefined : numberAt(branch, "index");
		// Nothing to stage when the save is already on this difficulty: staging a
		// no-op edit would put a line in the tray that changes nothing.
		if (current === undefined || current === index) return [];
		return [
			edit(["difficulty", "index"], `Difficulty: ${label}`, current, index),
		];
	},
}));

const NOTES: readonly FormatNote[] = [
	{
		title: "No checksum, and that is the whole trick",
		body: "A Witcher 3 save carries no checksum over its contents — not in the container, not in the SAV3 stream, not in the footer. The only CRC in the game belongs to the asset bundle format, which is a different file. So a value written in place needs nothing recomputed, and that is what makes a browser editor possible at all.",
	},
	{
		title: "Write the same width, or not at all",
		body: "A field's width must not change. Overwrite a u16 with a u16 and the stream keeps its length, so no offset anywhere moves. Change a length — adding a skill, renaming a string — and every offset after it shifts, which would mean rewriting the token stream, the span index and the variable table. The variable table's coordinate base is still not fully understood, so those operations are out of reach here. The edits on offer are scalars only, and that is a limit of the format work rather than a choice.",
	},
	{
		title: "Addresses are found, never remembered",
		body: "Three saves of the same build put the wallet at 3640748, 3640300 and 3640999, because everything ahead of it in the stream moves. So this editor looks each field up by its shape and its build-specific identity every time, and stores values rather than addresses. The wallet is found by requiring both the record shape and the item identity: the shape alone matches 1845 records in a real save, and only one of them is the player's.",
	},
	{
		title: "What the game does with the result",
		body: "Every rebuilt file is decoded again before it is offered for download, and the values you set are read back out of the rebuilt bytes. That proves the file is self-consistent and that the edits landed. It is not proof the game will load it — only launching the game settles that, and this page cannot.",
	},
];

export const witcher3: SaveCodec = {
	id: ID,
	game: "The Witcher 3: Wild Hunt",
	formatLabel: "SNFH/FZLC container, LZ4 blocks, REDkit token stream",
	extensions: ["sav"],
	defaultPath:
		"Windows: Documents\\GOG Games\\The Witcher 3\\Game\\savedata  ·  Linux: ~/.local/share/Steam/steamapps/compatdata/1091500/pfx/drive_c/users/steamuser/My Documents/GOG Games/The Witcher 3/savedata",
	notes: NOTES,
	decode,
	encode,
	summarise,
	actions: [...ACTIONS, ...difficultyActions],
};
