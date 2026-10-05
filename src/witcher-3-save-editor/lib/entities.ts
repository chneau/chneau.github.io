/**
 * World entities, and the per-entity flags that say what the player has done to
 * them: dead, looted, destroyed, muted, seen, respawning.
 *
 * ## What is walked
 *
 * World state is **not** in the `universe` root — `universe` is the streaming
 * load list. The persisted entities are in each world's `layerStorage`, and each
 * is
 *
 * ```
 * BS entityData
 *   VL idTag : IdTag
 *   SXAP <major minor third>
 *   BLCK Entity
 *     AVAL nP : Uint32           # how many properties follow
 *     <nP × (PORP|AVAL|VL|OP) name : type = value>
 *     AVAL nC : Uint32           # how many components follow
 * ```
 *
 * so walking the token stream and cutting each property list at its `nC` gives
 * the **complete set of per-entity properties this save writes**, with how many
 * entities carry each. That is the headline: 149 distinct property names over
 * 6,525 entities on the `52586` fixture (measured here, and the same figure the
 * reference decoder measured on the same file) and 113 over 640 on `8559a`.
 *
 * ## A property is written only when it differs from the engine default
 *
 * The writer elides a field at its default, so **the absence of `isDead` is not
 * evidence that the entity is alive** — it is evidence that the field is at its
 * default. Every count here is therefore "entities that *write* this property",
 * never "entities that are in this state", and {@link FlagUsage}'s `state` says
 * which of the two a caller is looking at. On the large fixture 6,507 of the
 * 6,525 entities write no `isDead` at all, and 3 of the 18 that do write it say
 * `true`.
 *
 * ## Which immortality bits are documented, and which are not
 *
 * `immortalityFlags : Int32` (`actor.ws:87`) is a bit set and the script gives
 * its shape: `GetPureImmortalityFlags` masks to `16777215` (`0xFFFFFF`, 24
 * bits), and `actor.ws:351-390` builds each bit as `channelValue × modeOffset`
 * with `modeOffset ∈ {1, 256, 65536}` over eight `EActorImmortalityChannel`
 * values `1…128`. So:
 *
 *  - **Bits 0–23 are structured and the channel within a block is resolved**:
 *    `channel = bit % 8` selects one of the eight `AIC_*` members and
 *    `modeOffset = 2 ** (8 × (bit ÷ 8))`. The three block offsets measured across
 *    both fixtures are exactly `1`, `256` and `65536` — which is what makes the
 *    reading sound rather than merely consistent.
 *  - **Which `EActorImmortalityMode` member a block belongs to is NOT resolved,
 *    and the reference decoder's own note cannot be trusted on it.** That note
 *    lists the offsets `{1, 256, 65536}` against the mode names in the order
 *    `AIM_Unconscious`, `AIM_Immortal`, `AIM_Invulnerable`, but the catalogue
 *    declares `EActorImmortalityMode` as `AIM_None`, `AIM_Immortal`,
 *    `AIM_Invulnerable`, `AIM_Unconscious` — so declaration order would pair
 *    `1` with `AIM_Immortal` and `65536` with `AIM_Unconscious`, the opposite
 *    end for end. Both readings cannot be right and nothing in a save or in the
 *    catalogue settles it, so {@link ImmortalityBit} carries the measured
 *    `modeOffset` and the resolved `channel` and stops there. Naming the mode
 *    would be a confident-looking guess about which of two documented orderings
 *    is the real one.
 *  - **Bits 24–31 are outside every documented meaning.** `actor.ws` masks them
 *    away before interpreting, and 4 entities on the large fixture and 1 on the
 *    small one set bit 24. They are counted in
 *    {@link Immortality.entitiesWithUndocumentedBits} and named by nobody.
 *
 * Nothing here asserts that any bit means "dead". The decoder's guess that bit 0
 * is "plausibly already dead" is inference from frequency — bit 0 is the
 * commonest non-zero value on both fixtures, 195 of 274 and 6 of 33 — and it is
 * exactly the kind of claim a reader should be given rather than a reader should
 * be handed as fact.
 *
 * ## Generic containers are a set keyed by an id this decoder cannot place
 *
 * A monster-clue stash carries `lootWasOfferedToPlayer` / `stashWasLooted` as
 * ordinary per-entity fields, but a **generic container** does not: its state
 * lives in the `ContainerManagerSaveInfo` root, a table of fixed 19-byte records
 * `{u8 flag, 16 bytes entity id, u8 kind, i16 mask}`. The `u32 count` followed by
 * `count × 19` fills the object's body exactly — 6,884 records over 130,796
 * bytes on the large fixture, 257 over 4,883 on the small one — and that exact
 * fit is the only evidence for the stride.
 *
 * {@link GenericContainerState} reports the **count and the mask histogram**,
 * and nothing else, because two measured facts stop it there. The mapping from
 * mask bit to meaning is in no script and no enum the save carries — and the
 * histogram is of *absences*, since the field is a sixteen-bit set held mostly
 * all-ones: `-1` is 0xFFFF (nothing cleared), `-2` is 0xFFFE (bit 0 clear), `-4`
 * is 0xFFFC (bits 0–1 clear), so the frequency of a value is the frequency of a
 * state being unset and nothing says which unset means looted.
 *
 * And the 16-byte ids are **not** RFC-4122 GUIDs: the version nibble at byte 6
 * is uniform over 0–15 (measured: 17, 19, 19, 14, 16, 15, 18, 17, 14, 17, 9, 14,
 * 13, 23, 17, 15 occurrences), which is what random bytes give and what no
 * versioned GUID does. {@link GenericContainerState.rfc4122ShapedIdentifiers}
 * carries the resulting rate: 2,198 of 6,884 on the large fixture (31.9%) and 81
 * of 257 on the small one. The decoder's prose quotes that 31.9% while its own
 * probe table prints 0 — the two disagree, and the prose's figure is the one this
 * module reproduces at the id offset the prose describes, so the probe's own
 * offset is a byte out. It changes nothing here: at either figure the entity each
 * record keys cannot be identified from the table alone, so a per-entity "this
 * container is looted" claim would be a fabrication wearing a count.
 *
 * ## Not every entity can be named, and that is not fixable here
 *
 * `readContainers` labels the ~290 (`52586`) / ~112 (`8559a`) `BS entityData`
 * frames by joining the frame's `idTag` to the community registry entry sharing
 * it — a community basename, `idTag <hex>` when the entity has no community, or
 * `player` for the one frame holding `levelManager`. The save stores **no
 * display template** inside an entity frame, so that join is the only naming
 * available, and it only covers the promoted entities.
 *
 * The property walk sees far more entities than that: 6,525 property lists
 * against 290 promoted `entityData` frames on the large fixture, 640 against 112
 * on the small one. The rest live in the per-world `SS` streaming blobs and in
 * component sub-objects, and **which entities get promoted is not determined**
 * (the reference decoder's open question O7). It matters here for one reason: a
 * flag on a non-promoted entity may not survive a save round-trip at all. So
 * {@link EntityFlags} counts flagged entities across the whole walk and says how
 * many could be named, and {@link EntitySample} samples only the named ones
 * rather than inventing a label for the rest.
 *
 * ## Nothing here is written
 *
 * Every field is a pure function of the bytes, and nothing here is a candidate
 * for an edit — including `lastDayOfInteraction`, which the decoder's note calls
 * the one piece of merchant state an editor could meaningfully write (it is the
 * stock-refill clock `merchantNPC.ws:187` compares against
 * `gameTimeDay`). It is reported as a plain `Int32` day number and left alone.
 */

import names from "./generated/names.json";
import { readNameTable } from "./names";
import { type ObjectNode, readObjectTree } from "./objects";
import { reflectValue } from "./reflect";
import { parseTokens, type Token } from "./tokens";

/**
 * The catalogue's `enums` section, read directly rather than through `./catalog`.
 *
 * `./catalog` deliberately does not re-export it, because `enumTypes` there is a
 * byte-for-byte duplicate of `ENUM_TYPES` in `./enums` and shipping both is two
 * lists that can drift. That reasoning is about `enumTypes`; `enums` is a
 * different key, no module reads it, and importing it duplicates no list.
 */
const CATALOGUE_ENUMS: Readonly<Record<string, readonly string[]>> =
	names.enums;

/**
 * How many individual entities {@link EntitySample} carries.
 *
 * A save holds hundreds of entities with interesting flags — 825 on the large
 * fixture, 291 on the small one — and the sample exists to show the shape of a
 * flagged entity, not to enumerate them. Entities past the cap are dropped from
 * the sample only: {@link EntityFlags.entitiesWithNotableFlags} and {@link
 * EntityFlags.namedEntitiesWithNotableFlags} still count every one, so a
 * truncated sample never understates a total.
 */
const ENTITY_SAMPLE_CAP = 24;

/**
 * How many distinct values a single flag's histogram keeps.
 *
 * An `Int32` day counter takes as many values as the save has days, and the
 * reference decoder measured 12 distinct `lastDayOfInteraction` values and 33
 * `fullRespawnTime` values on the large fixture, so the tail is a long tail of
 * one-occurrence entries. Dropped entries are still counted in {@link
 * FlagUsage.distinctValues}, so the truncation is visible from the field beside
 * the histogram rather than hidden by the cap.
 */
const FLAG_VALUE_CAP = 8;

/**
 * How many distinct `ContainerManagerSaveInfo` masks the histogram keeps.
 *
 * The large fixture has 18 distinct mask values over 6,884 records and the small
 * one 12 over 257. The cap keeps the common ones and {@link
 * GenericContainerState.distinctMasks} carries the true total.
 */
const CONTAINER_MASK_CAP = 8;

/** One distinct value a flag takes, with how many entities take it. */
type FlagValue = {
	/** the value as this module decoded it, or `""` when it decoded nothing */
	readonly value: string;
	readonly entities: number;
};

/**
 * Whether a tracked property is written by this save at all, and by how many
 * entities.
 *
 * The cases are separate rather than one count covering all of them, because
 * "0 entities write `isTalkDisabled`" and "this save's name table has no
 * `isTalkDisabled`" are different facts with different causes. The save's own
 * `MANU` table is the test, and both branches occur on the fixtures: on `8559a`,
 * `m_wasDestroyed` and `levelFakeAddon` are absent from the table entirely,
 * while `isTalkDisabled` and `disableConstrainLookat` are present in it and
 * written by no entity — that is a level-4 playthrough in which no quest has
 * muted an NPC, not a decoder failure.
 *
 * A caller that renders `state: "unused"` as `0` is showing the reader a number
 * the save never wrote.
 */
export type FlagUsage =
	| {
			readonly state: "written";
			/** the MANU property name, e.g. `stashWasLooted` */
			readonly name: string;
			/** the MANU type the value was read as, e.g. `Bool`, `Int32` */
			readonly type: string;
			readonly entities: number;
			/** distinct values seen, before {@link FLAG_VALUE_CAP} truncated the list */
			readonly distinctValues: number;
			/** the commonest values, at most {@link FLAG_VALUE_CAP} of them */
			readonly values: readonly FlagValue[];
	  }
	| {
			/** the MANU property name, e.g. `isTalkDisabled` */
			readonly name: string;
			/**
			 * No entity writes this property. `inNameTable` says whether the save's
			 * own `MANU` table carries the name, separating "the engine knows this
			 * field and this playthrough never tripped it" from "this build's name
			 * table has never heard of it".
			 */
			readonly state: "unused";
			readonly inNameTable: boolean;
	  };

/**
 * One bit of `immortalityFlags`, counted over the entities that write it.
 *
 * Only bits that occur appear here. `modeOffset` and `channel` are what the
 * scripts resolve; the mode *name* is deliberately absent — see the header for
 * why the `modeOffset` → `AIM_*` pairing cannot be settled from the catalogue.
 */
type ImmortalityBit = {
	/** bit position in the `Int32`, 0–31 */
	readonly bit: number;
	/** the documented `channelValue × modeOffset` product, `2 ** bit` */
	readonly mask: number;
	/** `1`, `256` or `65536` for bits 0–23; `null` above, where no mode applies */
	readonly modeOffset: number | null;
	/** the `EActorImmortalityChannel` member this bit selects, `null` above bit 23 */
	readonly channel: string | null;
	readonly entities: number;
};

/** The `immortalityFlags` bit set, as far as the scripts let it be read. */
type Immortality = {
	/** entities that write `immortalityFlags` */
	readonly entities: number;
	/** entities writing `immortalityFlagsCopy`, the actor's mirror of the above */
	readonly copyEntities: number;
	/** the distinct `Int32` values, commonest first, at most {@link FLAG_VALUE_CAP} */
	readonly values: readonly FlagValue[];
	readonly distinctValues: number;
	/** bits 0–23 only, resolved to a `modeOffset` and a channel */
	readonly bits: readonly ImmortalityBit[];
	/**
	 * Entities setting at least one bit at or above 24 — outside the mask
	 * `GetPureImmortalityFlags` applies, so no script gives them a meaning.
	 */
	readonly entitiesWithUndocumentedBits: number;
};

/**
 * One tracked property as read off one entity.
 *
 * `names` is populated for the two `array:2,0,CName` allow-lists and `null`
 * everywhere else. It is a second view of the same bytes, not a separate fact
 * about the entity.
 */
type FlagReading = {
	readonly name: string;
	readonly value: string;
	/** resolved through this save's own `MANU`, `null` when the value is not a CName */
	readonly names: readonly (string | null)[] | null;
};

/**
 * One flagged entity, labelled the way `readContainers` labels a container.
 *
 * `label` is `"player"`, a community basename (`keira_metz`), or `idTag <hex>`.
 * {@link EntityFlags.sample} carries only entities that have one: the un-promoted
 * majority is counted, not labelled, because nothing in the save names them.
 */
type EntitySample = {
	readonly label: string;
	readonly flags: readonly FlagReading[];
};

/**
 * `ContainerManagerSaveInfo`: the generic containers' state table.
 *
 * Counts only, for the reasons in the header — the mask bits are unnamed and the
 * 16-byte ids do not resolve to an entity. `null` when the save carries no such
 * root, or when no `count × 19` fits its body exactly.
 */
type GenericContainerState = {
	/** the `u32 count`, and the number of 19-byte records the object body holds */
	readonly records: number;
	/** distinct 16-byte ids; equal to `records` on both fixtures, i.e. a set */
	readonly distinctIdentifiers: number;
	/**
	 * How many ids pass an RFC-4122 shape test. It is the measurement behind
	 * refusing a per-entity claim: a genuine GUID would pass nearly always, and
	 * these do not.
	 */
	readonly rfc4122ShapedIdentifiers: number;
	readonly distinctMasks: number;
	/** the commonest `i16 mask` values, at most {@link CONTAINER_MASK_CAP} of them */
	readonly masks: readonly FlagValue[];
};

/** Everything this module reads about the save's entities. */
export type EntityFlags = {
	/** `BLCK Entity` property lists in the whole save — 6,525 / 640 measured */
	readonly entities: number;
	/** distinct property names over those lists — 149 / 113 measured */
	readonly distinctPropertyNames: number;
	/**
	 * `BS entityData` frames, i.e. the entities `readContainers` can name: 290 /
	 * 112 measured, against 6,525 / 640 property lists. The gap is the un-promoted
	 * entities, and which entities get promoted is not determined.
	 */
	readonly promotedEntities: number;
	readonly flags: readonly FlagUsage[];
	readonly immortality: Immortality;
	/** entities carrying at least one tracked property with a notable value */
	readonly entitiesWithNotableFlags: number;
	/** how many of those sit inside a promoted `entityData` frame and can be named */
	readonly namedEntitiesWithNotableFlags: number;
	/** at most {@link ENTITY_SAMPLE_CAP} of the named ones */
	readonly sample: readonly EntitySample[];
	readonly genericContainerState: GenericContainerState | null;
};

/**
 * The per-entity properties this module reports on.
 *
 * A hand-picked list rather than the save's full union of 149 names, chosen
 * because each name answers a question about what the player has done to the
 * world. The union itself is reported as a count ({@link
 * EntityFlags.distinctPropertyNames}) and is not enumerated: 149 rows of per-save
 * property names is a census, not a document, and it would change with the save.
 *
 * `fullRespawnTime` is here as the partner of `fullRespawnScheduled`: the `Bool`
 * says a respawn is pending and the `GameTime` says until when. Its value is
 * reported — see the `GameTime` note in {@link decodeValue}.
 */
const TRACKED_FLAGS: readonly string[] = [
	// alive / dead
	"isDead",
	"immortalityFlags",
	"immortalityFlagsCopy",
	// destroyed
	"destroyed",
	"m_wasDestroyed",
	"canBeDestroyed",
	// looted
	"lootWasOfferedToPlayer",
	"stashWasLooted",
	"isStashDisabled",
	// NPC interaction
	"isTalkDisabled",
	"dontUseReactionOneLiners",
	"disableConstrainLookat",
	"canFlee",
	"levelFakeAddon",
	// voiceset one-shots
	"voicesetPlayed",
	"voicesetTime",
	"initialVoicesetPlayed",
	// merchant stock clock
	"lastDayOfInteraction",
	// witcher-senses and bestiary clues
	"wasSeen",
	"wasDetected",
	"medallionVibratedEver",
	"nestFound",
	// respawn
	"fullRespawnScheduled",
	"fullRespawnTime",
	// quest-only display allow-list
	"questEntitiesToBeShown",
	"questNonActorEntitiesToBeShown",
];

/** `true` when the token is one of the four tags a property record wears. */
const isPropertyToken = (token: Token): boolean =>
	token.tag === "PORP" ||
	token.tag === "AVAL" ||
	token.tag === "VL" ||
	token.tag === "OP";

/** The `Int32` and `Uint32` spellings the walk can hand back. */
const INTEGER_TYPES: ReadonlySet<string> = new Set([
	"Int8",
	"Int16",
	"Int32",
	"Uint8",
	"Uint16",
	"Uint32",
]);

/**
 * One decoded value: its rendering, whether it is worth reporting, and the
 * resolved names when it is a CName list.
 */
type Decoded = {
	/** `""` when this module deliberately decoded nothing */
	readonly value: string;
	readonly notable: boolean;
	readonly names: readonly (string | null)[] | null;
};

const NOTHING: Decoded = { value: "", notable: false, names: null };

/**
 * The name a 1-based `MANU` index refers to, or `null`.
 *
 * `names` is this save's own pool, and it is shorter than the save's largest
 * index — `questEntitiesToBeShown` carries `CName(3506)` on the `52586` fixture,
 * whose table has 6,350 entries. An index with no entry resolves to nothing
 * rather than to a neighbour's name.
 */
const cnameAt = (
	names: readonly string[],
	index: number | undefined,
): string | null =>
	index === undefined || index < 1 ? null : (names[index - 1] ?? null);

/** The `CName(n)` rendering `reflect.ts` produces, read back as `n`. */
const cnameIndex = (text: string): number | undefined => {
	const match = /^CName\((\d+)\)$/.exec(text);
	if (match === null) return undefined;
	const parsed = Number(match[1]);
	return Number.isFinite(parsed) ? parsed : undefined;
};

/** Where a token's value bytes begin: after the tag, name, type and length. */
const valueOffsetOf = (token: Token): number =>
	token.offset + token.size - (token.value?.bytes.length ?? 0);

/**
 * Decode one tracked property's value.
 *
 * A `GameTime` is a struct `{ m_seconds : Int32 }` and is reported as the second
 * count it holds. It used to be refused here, and the reason was a width
 * disagreement in `tokens.ts` rather than anything about the value: with the
 * walker measuring 11 bytes for a frame the writer had emitted 15, `reflectValue`
 * could not close on it and the honest thing to do with a value this module had
 * not read was to claim none. The walker now measures the frame (see
 * `readGameTime`), so `fullRespawnTime` reads: 579 entities, 33 distinct values
 * on the large fixture, which is the figure the reference decoder measured on
 * the same save.
 *
 * The empty 3-byte form decodes to `0` and not to nothing. That is the writer
 * saying the member is at its default, which for an `Int32` second count is
 * zero, so the value is known even when it is uninteresting — and it is 544 of
 * the 579 `fullRespawnTime` values on the large fixture.
 */
const decodeValue = (
	data: Uint8Array,
	names: readonly string[],
	token: Token,
): Decoded => {
	const value = token.value;
	if (value === undefined) return NOTHING;
	if (value.type === "Bool") {
		return { value: value.text, notable: value.text === "true", names: null };
	}
	if (INTEGER_TYPES.has(value.type) || value.type === "Float") {
		const parsed = Number(value.text);
		return {
			value: value.text,
			notable: Number.isFinite(parsed) && parsed !== 0,
			names: null,
		};
	}
	if (value.type === "CName") {
		const resolved = cnameAt(names, cnameIndex(value.text));
		return { value: resolved ?? value.text, notable: true, names: null };
	}
	// Numeric like an `Int32`, because that is what the walker rendered: the
	// `m_seconds` the struct holds. Notable when it is set, the same test the
	// other integer properties use.
	if (value.type === "GameTime") {
		const seconds = Number(value.text);
		return {
			value: value.text,
			notable: Number.isFinite(seconds) && seconds !== 0,
			names: null,
		};
	}
	if (value.type.startsWith("array:2,0,")) {
		const length = value.bytes.length;
		const reflected = reflectValue(
			data,
			names,
			value.type,
			valueOffsetOf(token),
			length,
		);
		if (reflected === undefined || reflected.kind !== "array") {
			return { value: `${length} byte(s)`, notable: false, names: null };
		}
		const resolved = (reflected.items ?? []).map((item) =>
			cnameAt(names, cnameIndex(item.text)),
		);
		return {
			value: `[${reflected.count ?? resolved.length}]`,
			notable: resolved.length > 0,
			names: resolved,
		};
	}
	return { value: value.text, notable: false, names: null };
};

/** Most-common-first, capped, with the untruncated total kept beside it. */
const histogram = (
	counts: ReadonlyMap<string, number>,
	cap: number,
): { distinctValues: number; values: readonly FlagValue[] } => {
	const ordered = [...counts].sort((a, b) => b[1] - a[1]);
	return {
		distinctValues: ordered.length,
		values: ordered
			.slice(0, cap)
			.map(([value, entities]) => ({ value, entities })),
	};
};

/** The `entityData` frame boundaries, in stream order. */
const promotedSpans = (
	roots: readonly ObjectNode[],
): {
	offset: number;
	end: number;
}[] => {
	const spans: { offset: number; end: number }[] = [];
	const walk = (nodes: readonly ObjectNode[]): void => {
		for (const node of nodes) {
			if (node.span.token.name === "entityData") {
				spans.push({ offset: node.span.offset, end: node.span.end });
			}
			walk(node.children);
		}
	};
	walk(roots);
	spans.sort((a, b) => a.offset - b.offset);
	return spans;
};

const hexOf = (bytes: Uint8Array): string =>
	[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

/**
 * `idTag` → community path, from the registry entry sharing the id.
 *
 * The same join `readContainers` makes, and the reason an entity can be named at
 * all. A `community` `String` is looked for within 3,000 bytes of its `idTag` and
 * the search stops at the next `idTag`, so a lookup cannot run past its own
 * registry entry.
 */
const communityByIdTag = (
	tokens: readonly Token[],
): ReadonlyMap<string, string> => {
	const map = new Map<string, string>();
	for (let i = 0; i < tokens.length; i += 1) {
		const tag = tokens[i];
		if (tag === undefined || tag.name !== "idTag" || tag.value === undefined) {
			continue;
		}
		for (let j = i + 1; j < tokens.length; j += 1) {
			const next = tokens[j];
			if (next === undefined) break;
			if (next.name === "community" && next.value?.type === "String") {
				map.set(hexOf(tag.value.bytes), next.value.text);
				break;
			}
			if (next.name === "idTag") break;
		}
	}
	return map;
};

/** `quests\…\keira_metz.w2comm` -> `keira_metz`, as `readContainers` reduces it. */
const communityLabel = (path: string): string => {
	const base = path.split(/[\\/]/).pop() ?? path;
	return base.replace(/\.w2comm$/i, "") || path;
};

/**
 * The label for each `entityData` frame: `player`, a community basename, or
 * `idTag <hex>`.
 *
 * `player` is the frame holding `levelManager`, a token unique to the player's
 * entity — the only way to tell the player apart without a template name.
 */
const labelSpans = (
	tokens: readonly Token[],
	spans: readonly { offset: number; end: number }[],
	communities: ReadonlyMap<string, string>,
): readonly string[] => {
	const player = tokens.find(
		(t) =>
			t.name === "levelManager" && t.value?.type === "handle:W3LevelManager",
	);
	return spans.map((span) => {
		const inside = tokens.filter(
			(t) => t.offset >= span.offset && t.offset < span.end,
		);
		const tag = inside.find((t) => t.name === "idTag" && t.value !== undefined);
		const hex = tag?.value === undefined ? "" : hexOf(tag.value.bytes);
		const isPlayer =
			player !== undefined &&
			player.offset >= span.offset &&
			player.offset < span.end;
		const community = communities.get(hex);
		return isPlayer
			? "player"
			: community !== undefined
				? communityLabel(community)
				: hex !== ""
					? `idTag ${hex}`
					: "container";
	});
};

/**
 * Which promoted span a byte offset falls inside, or `-1`.
 *
 * A binary search rather than a scan: the sample is built per entity and a linear
 * search over 290 spans for each of 6,525 entities is the difference between
 * milliseconds and seconds on the large fixture.
 */
const spanIndexAt = (
	spans: readonly { offset: number; end: number }[],
	offset: number,
): number => {
	let low = 0;
	let high = spans.length - 1;
	while (low <= high) {
		const mid = (low + high) >> 1;
		const span = spans[mid];
		if (span === undefined) break;
		if (offset < span.offset) high = mid - 1;
		else if (offset >= span.end) low = mid + 1;
		else return mid;
	}
	return -1;
};

const u32 = (data: Uint8Array, at: number): number =>
	((data[at] ?? 0) |
		((data[at + 1] ?? 0) << 8) |
		((data[at + 2] ?? 0) << 16) |
		((data[at + 3] ?? 0) << 24)) >>>
	0;

const i16 = (data: Uint8Array, at: number): number => {
	const value = u32(data, at) & 0xffff;
	return value > 0x7fff ? value - 0x10000 : value;
};

/**
 * Byte width of one `ContainerManagerSaveInfo` record.
 *
 * `count × 19` fills the object's body exactly on both fixtures, and that exact
 * fit is the only evidence for the stride: no other count or stride fits.
 */
const CONTAINER_RECORD_BYTES = 19;

/** Where the 16-byte id sits inside the record, and where the `i16 mask` does. */
const CONTAINER_ID_OFFSET = 1;
const CONTAINER_MASK_OFFSET = 17;

/**
 * An RFC-4122 shape test, kept because its *failure* rate is the measurement.
 *
 * A real GUID satisfies the version and variant nibbles; these ids satisfy them
 * about a third of the time, which is the rate a random 16-byte value gives.
 */
const isRfc4122 = (bytes: Uint8Array): boolean => {
	const version = (bytes[6] ?? 0) >> 4;
	const variant = bytes[8] ?? 0;
	return version >= 1 && version <= 5 && variant >= 0x80 && variant <= 0xbf;
};

/** Depth-first search for the one named object in the tree. */
const findSpan = (
	roots: readonly ObjectNode[],
	name: string,
): ObjectNode | undefined => {
	const walk = (node: ObjectNode): ObjectNode | undefined => {
		if (node.span.token.name === name) return node;
		for (const child of node.children) {
			const hit = walk(child);
			if (hit !== undefined) return hit;
		}
		return undefined;
	};
	for (const root of roots) {
		const hit = walk(root);
		if (hit !== undefined) return hit;
	}
	return undefined;
};

/**
 * Count the generic containers' state records.
 *
 * The `u32 count` is located by the only test that fits: the object body is
 * exactly `count × 19` bytes. A save where nothing fits reports `null` rather
 * than a count borrowed from another build's layout.
 */
const readGenericContainerState = (
	data: Uint8Array,
	roots: readonly ObjectNode[],
): GenericContainerState | null => {
	const root = findSpan(roots, "ContainerManagerSaveInfo");
	if (root === undefined) return null;

	let start = -1;
	let count = 0;
	for (let at = root.span.offset; at < root.span.offset + 64; at += 1) {
		const candidate = u32(data, at);
		if (
			candidate > 8 &&
			at + 4 + candidate * CONTAINER_RECORD_BYTES === root.span.end
		) {
			start = at + 4;
			count = candidate;
			break;
		}
	}
	if (start < 0) return null;

	const masks = new Map<string, number>();
	const ids = new Set<string>();
	let rfcShaped = 0;
	for (let i = 0; i < count; i += 1) {
		const at = start + i * CONTAINER_RECORD_BYTES;
		// Byte 0 of the record is the flag; the id occupies bytes 1..16.
		const id = data.subarray(
			at + CONTAINER_ID_OFFSET,
			at + CONTAINER_ID_OFFSET + 16,
		);
		ids.add(hexOf(id));
		if (isRfc4122(id)) rfcShaped += 1;
		const mask = String(i16(data, at + CONTAINER_MASK_OFFSET));
		masks.set(mask, (masks.get(mask) ?? 0) + 1);
	}
	const hist = histogram(masks, CONTAINER_MASK_CAP);
	return {
		records: count,
		distinctIdentifiers: ids.size,
		rfc4122ShapedIdentifiers: rfcShaped,
		distinctMasks: hist.distinctValues,
		masks: hist.values,
	};
};

/** One tracked flag's tally, accumulated while the walk runs. */
type Usage = {
	/** The MANU type of the first entity seen writing it; a save does not vary it. */
	type: string;
	readonly counts: Map<string, number>;
	entities: number;
};

/**
 * Read the save's world-entity flags.
 *
 * `names` defaults to the save's own `MANU` table; `scan` may be a token list and
 * `tree` an object tree the caller already holds. Pass all three when you have
 * them. The walk is the expensive half — 250,640 tokens and ~1.1 s on the large
 * fixture — and the tree build another ~246 ms, so a caller that has already done
 * either should not pay twice.
 */
export const readEntityFlags = (
	data: Uint8Array,
	names: readonly string[] = readNameTable(data).names,
	scan?: readonly Token[],
	tree?: readonly ObjectNode[],
): EntityFlags => {
	const tokens = scan ?? parseTokens(data, names).tokens;
	const roots = tree ?? readObjectTree(data).roots;
	const spans = promotedSpans(roots);
	const labels = labelSpans(tokens, spans, communityByIdTag(tokens));

	const usage = new Map<string, Usage>();
	const propertyNames = new Set<string>();
	const bitCounts = new Map<number, number>();
	const immValues = new Map<string, number>();
	let immEntities = 0;
	let immCopyEntities = 0;
	let immUndocumented = 0;
	let entities = 0;
	let flagged = 0;
	let namedFlagged = 0;
	const sample: EntitySample[] = [];

	/**
	 * One `BLCK Entity` property list, cut at its `nC`.
	 *
	 * The cut is what makes the counts mean "entities" rather than "tokens": a
	 * property after `nC` belongs to a component, not to the entity. The declared
	 * `nP` matched the properties counted on every one of the 6,525 lists on the
	 * large fixture and every one of the 640 on the small one, so the framing is
	 * measured rather than assumed.
	 */
	const readEntity = (start: number): void => {
		entities += 1;
		const readings: FlagReading[] = [];
		for (let i = start + 1; i < tokens.length; i += 1) {
			const token = tokens[i];
			if (token === undefined) break;
			if (token.tag === "BLCK" && token.name === "Entity") break;
			if (token.tag === "AVAL" && token.name === "nC") break;
			if (token.tag === "AVAL" && token.name === "nP") continue;
			if (!isPropertyToken(token)) continue;
			propertyNames.add(token.name);
			if (token.name === "immortalityFlags") {
				const text = token.value?.text ?? "";
				const raw = Number(text);
				if (Number.isFinite(raw)) {
					immEntities += 1;
					immValues.set(text, (immValues.get(text) ?? 0) + 1);
					let documented = true;
					for (let bit = 0; bit < 32; bit += 1) {
						if (((raw >>> bit) & 1) === 0) continue;
						bitCounts.set(bit, (bitCounts.get(bit) ?? 0) + 1);
						if (bit >= 24) documented = false;
					}
					if (!documented) immUndocumented += 1;
				}
			}
			if (token.name === "immortalityFlagsCopy") immCopyEntities += 1;
			if (!TRACKED_FLAGS.includes(token.name)) continue;
			const decoded = decodeValue(data, names, token);
			const entry = usage.get(token.name) ?? {
				type: token.value?.type ?? "",
				counts: new Map<string, number>(),
				entities: 0,
			};
			entry.type = token.value?.type ?? entry.type;
			// Counted whether or not the value was decoded: `entities` is how many
			// entities *write* the property, which is a fact about the stream and not
			// about this reader's ability to render what it wrote. The histogram, by
			// contrast, only takes a value it decoded — a token that carries none adds
			// no entry, so an undecodable property shows a count and no values rather
			// than a count of empty strings.
			entry.entities += 1;
			if (decoded.value !== "") {
				entry.counts.set(
					decoded.value,
					(entry.counts.get(decoded.value) ?? 0) + 1,
				);
			}
			usage.set(token.name, entry);
			if (decoded.notable) {
				readings.push({
					name: token.name,
					value: decoded.value,
					names: decoded.names,
				});
			}
		}
		if (readings.length === 0) return;
		flagged += 1;
		const span = spanIndexAt(spans, tokens[start]?.offset ?? 0);
		if (span < 0) return;
		namedFlagged += 1;
		if (sample.length < ENTITY_SAMPLE_CAP) {
			sample.push({ label: labels[span] ?? "container", flags: readings });
		}
	};

	let index = 0;
	while (index < tokens.length) {
		const token = tokens[index];
		index += 1;
		if (token?.tag === "BLCK" && token.name === "Entity") readEntity(index - 1);
	}

	const flags: FlagUsage[] = TRACKED_FLAGS.map((name) => {
		const entry = usage.get(name);
		if (entry === undefined) {
			return {
				name,
				state: "unused",
				inNameTable: names.includes(name),
			};
		}
		const hist = histogram(entry.counts, FLAG_VALUE_CAP);
		return {
			name,
			state: "written",
			type: entry.type,
			entities: entry.entities,
			distinctValues: hist.distinctValues,
			values: hist.values,
		};
	});

	const bits: ImmortalityBit[] = [...bitCounts]
		.filter(([bit]) => bit < 24)
		.sort((a, b) => a[0] - b[0])
		.map(([bit, count]) => ({
			bit,
			mask: 2 ** bit,
			modeOffset: 2 ** (8 * Math.floor(bit / 8)),
			channel: CATALOGUE_ENUMS.EActorImmortalityChannel?.[bit % 8] ?? null,
			entities: count,
		}));

	const immHist = histogram(immValues, FLAG_VALUE_CAP);
	return {
		entities,
		distinctPropertyNames: propertyNames.size,
		promotedEntities: spans.length,
		flags,
		immortality: {
			entities: immEntities,
			copyEntities: immCopyEntities,
			values: immHist.values,
			distinctValues: immHist.distinctValues,
			bits,
			entitiesWithUndocumentedBits: immUndocumented,
		},
		entitiesWithNotableFlags: flagged,
		namedEntitiesWithNotableFlags: namedFlagged,
		sample,
		genericContainerState: readGenericContainerState(data, roots),
	};
};
