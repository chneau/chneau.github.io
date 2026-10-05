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
import { localizedString, questTitle } from "./catalog";
import { decompressContainer, type SaveContainer } from "./container";
import { buildContainer } from "./container-write";
import { readFactDB } from "./facts";
import { readContainers } from "./inventory";
import { readPlayer } from "./player";
import { questProgress } from "./quests";
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
	const skill = found.points.find((p) => p.kind === "skill");
	const experience = found.points.find((p) => p.kind === "exp");

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
		build: found.money === undefined ? "unrecognised" : "52586",
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
		skillPoints: skill ? { free: skill.free, used: skill.used } : null,
		experience: experience
			? { free: experience.free, used: experience.used }
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
			const db = readFactDB(container.data);
			if (db === undefined) return [];
			// Sorted by title so the list reads as a journal rather than as the
			// order the engine happened to write its facts in, and capped because
			// a late-game save holds hundreds: the summary row carries the true
			// count and the tree view carries the rest.
			return questProgress(db.facts)
				.map((q) => ({
					id: q.id,
					title: questTitle(q.id) ?? q.id,
					state: q.state,
					done: q.done,
					total: q.total,
				}))
				.sort((a, b) => a.title.localeCompare(b.title))
				.slice(0, 200);
		})(),
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

const encode = async (doc: JsonValue): Promise<Bytes> => {
	const scaffold = readScaffold(doc);
	if (scaffold === undefined) {
		throw new Error(
			"This document has no save attached to it. Re-open the file — the inspector cannot rebuild a save from its own projection.",
		);
	}

	// Re-derive every address from the payload rather than trusting one from
	// the document: the offsets are per-save and cannot survive being stored.
	const payload = scaffold.payload.slice();
	const found = locateWritable(payload);

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

	const rebuilt = buildContainer(scaffold.chunks, payload);
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

/** The Crowns row, which is the wallet. */
const crownsRow = (
	doc: JsonValue,
): { path: (string | number)[]; quantity: number } | undefined => {
	const list = requireArrayAt(doc, "items");
	for (const [index, row] of list.entries()) {
		if (!isJsonObject(row)) continue;
		if (stringAt(row, "name") !== "Crowns") continue;
		const quantity = numberAt(row, "quantity");
		if (quantity === undefined || quantity === null) continue;
		return { path: ["items", index, "quantity"], quantity };
	}
	return undefined;
};

const summarise = (doc: JsonValue): readonly SummaryRow[] => {
	const crowns = crownsRow(doc);
	const money = crowns?.quantity;
	const level = scalarOf(doc, "level");
	const rows: SummaryRow[] = [
		{
			label: "Build",
			value: requireStringAt(doc, "build"),
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
		rows.push({
			label: "Skill points",
			value: `${numberAt(skillPoints, "free") ?? 0} free`,
		});
	}
	const experience = objectAt(doc, "experience");
	if (experience !== undefined) {
		rows.push({
			label: "Experience",
			value: `${numberAt(experience, "free") ?? 0} available`,
		});
	}
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
	before: number,
	after: number,
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
