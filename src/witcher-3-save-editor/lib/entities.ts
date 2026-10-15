import names from "./generated/names.json";
import { readNameTable } from "./names";
import { type ObjectNode, readObjectTree } from "./objects";
import { reflectValue } from "./reflect";
import { parseTokens, type Token } from "./tokens";

const CATALOGUE_ENUMS: Readonly<Record<string, readonly string[]>> =
	names.enums;

const ENTITY_SAMPLE_CAP = 24;

const FLAG_VALUE_CAP = 8;

const CONTAINER_MASK_CAP = 8;

type FlagValue = {
	readonly value: string;
	readonly entities: number;
};

export type FlagUsage =
	| {
			readonly state: "written";
			readonly name: string;
			readonly type: string;
			readonly entities: number;
			readonly distinctValues: number;
			readonly values: readonly FlagValue[];
	  }
	| {
			readonly name: string;
			readonly state: "unused";
			readonly inNameTable: boolean;
	  };

type ImmortalityBit = {
	readonly bit: number;
	readonly mask: number;
	readonly modeOffset: number | null;
	readonly channel: string | null;
	readonly entities: number;
};

type Immortality = {
	readonly entities: number;
	readonly copyEntities: number;
	readonly values: readonly FlagValue[];
	readonly distinctValues: number;
	readonly bits: readonly ImmortalityBit[];
	readonly entitiesWithUndocumentedBits: number;
};

type FlagReading = {
	readonly name: string;
	readonly value: string;
	readonly names: readonly (string | null)[] | null;
};

type EntitySample = {
	readonly label: string;
	readonly flags: readonly FlagReading[];
};

type GenericContainerState = {
	readonly records: number;
	readonly distinctIdentifiers: number;
	readonly rfc4122ShapedIdentifiers: number;
	readonly distinctMasks: number;
	readonly masks: readonly FlagValue[];
};

export type EntityFlags = {
	readonly entities: number;
	readonly distinctPropertyNames: number;
	readonly promotedEntities: number;
	readonly flags: readonly FlagUsage[];
	readonly immortality: Immortality;
	readonly entitiesWithNotableFlags: number;
	readonly namedEntitiesWithNotableFlags: number;
	readonly sample: readonly EntitySample[];
	readonly genericContainerState: GenericContainerState | null;
};

const TRACKED_FLAGS: readonly string[] = [
	"isDead",
	"immortalityFlags",
	"immortalityFlagsCopy",
	"destroyed",
	"m_wasDestroyed",
	"canBeDestroyed",
	"lootWasOfferedToPlayer",
	"stashWasLooted",
	"isStashDisabled",
	"isTalkDisabled",
	"dontUseReactionOneLiners",
	"disableConstrainLookat",
	"canFlee",
	"levelFakeAddon",
	"voicesetPlayed",
	"voicesetTime",
	"initialVoicesetPlayed",
	"lastDayOfInteraction",
	"wasSeen",
	"wasDetected",
	"medallionVibratedEver",
	"nestFound",
	"fullRespawnScheduled",
	"fullRespawnTime",
	"questEntitiesToBeShown",
	"questNonActorEntitiesToBeShown",
];

const isPropertyToken = (token: Token): boolean =>
	token.tag === "PORP" ||
	token.tag === "AVAL" ||
	token.tag === "VL" ||
	token.tag === "OP";

const INTEGER_TYPES: ReadonlySet<string> = new Set([
	"Int8",
	"Int16",
	"Int32",
	"Uint8",
	"Uint16",
	"Uint32",
]);

type Decoded = {
	readonly value: string;
	readonly notable: boolean;
	readonly names: readonly (string | null)[] | null;
};

const NOTHING: Decoded = { value: "", notable: false, names: null };

const cnameAt = (
	names: readonly string[],
	index: number | undefined,
): string | null =>
	index === undefined || index < 1 ? null : (names[index - 1] ?? null);

const cnameIndex = (text: string): number | undefined => {
	const match = /^CName\((\d+)\)$/.exec(text);
	if (match === null) return undefined;
	const parsed = Number(match[1]);
	return Number.isFinite(parsed) ? parsed : undefined;
};

const valueOffsetOf = (token: Token): number =>
	token.offset + token.size - (token.value?.bytes.length ?? 0);

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

const communityLabel = (path: string): string => {
	const base = path.split(/[\\/]/).pop() ?? path;
	return base.replace(/\.w2comm$/i, "") || path;
};

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

const CONTAINER_RECORD_BYTES = 19;

const CONTAINER_ID_OFFSET = 1;
const CONTAINER_MASK_OFFSET = 17;

const isRfc4122 = (bytes: Uint8Array): boolean => {
	const version = (bytes[6] ?? 0) >> 4;
	const variant = bytes[8] ?? 0;
	return version >= 1 && version <= 5 && variant >= 0x80 && variant <= 0xbf;
};

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

type Usage = {
	type: string;
	readonly counts: Map<string, number>;
	entities: number;
};

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
