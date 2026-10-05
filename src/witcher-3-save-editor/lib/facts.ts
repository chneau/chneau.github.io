/**
 * The fact database — the quest/gameplay facts, stored in the part of the
 * decompressed stream the token walker cannot parse.
 *
 * ## Section framing
 *
 * ```
 * "SBDF" | u32 count | count × fact | "EBDF"
 * ```
 *
 * `count` is the declared number of records, and the walk must read exactly
 * that many and then land on `"EBDF"`. That is the load-bearing check: a wrong
 * record shape desynchronises within a handful of records and the count stops
 * matching.
 *
 * ## Record framing
 *
 * ```
 * fact :=
 *   [u8 0x80 | nameLen] [nameLen bytes]   name, the same String encoding as tokens
 *   [u16 unknown = 0] [u16 count]         count is the fact value
 *   count × [u16 1] [f32 time] [f32 validFor]
 * ```
 *
 * Each of the `count` trailing entries is one event that contributed to the
 * value (`actor_lw_drowner_beached_boat_was_killed` = 7 has seven entries).
 *
 * Two quirks, both required and both documented in the reference tooling:
 *
 *  - a stray `0x01` sometimes sits between a name header and its name and must
 *    be skipped;
 *  - names are not printable-only (`q203\x1f_what_happend` occurs), so only NUL
 *    is treated as a sign of drifting off the list.
 *
 * Verified against `66/29` saves: both a 3,997-record and a 33,329-record save
 * read their declared count exactly and terminate on `"EBDF"`. The older
 * `64/27` saves use a different record shape and are not covered.
 */

import { readU32 } from "./inner";

/** One event that contributed to a fact's value. */
type FactEntry = {
	/** `[u16]` before the timestamp; 1 on every entry seen. */
	readonly flag: number;
	/** engine time of the event that contributed to the value */
	readonly time: number;
	/** -1 = permanent */
	readonly validFor: number;
};

export type Fact = {
	/** offset of the record in the decompressed stream */
	readonly offset: number;
	readonly name: string;
	/** the fact value: number of kills/hits/events */
	readonly value: number;
	readonly entries: readonly FactEntry[];
	/** total bytes the record occupies */
	readonly size: number;
};

type FactDB = {
	/** offset of the `"SBDF"` magic */
	readonly offset: number;
	readonly declaredCount: number;
	readonly facts: readonly Fact[];
	/** offset one past the last record (the `"EBDF"` magic, when terminated) */
	readonly endOffset: number;
	/** the section ended on `"EBDF"` */
	readonly terminated: boolean;
	/** bytes stepped over between records because one failed to parse */
	readonly skippedBytes: number;
};

/** A record may not claim more than this many events. */
const MAX_ENTRIES = 100_000;
/** A section may not claim more than this many records. */
const MAX_RECORDS = 2_000_000;

const u16 = (data: Uint8Array, o: number): number =>
	(data[o] ?? 0) | ((data[o + 1] ?? 0) << 8);

const f32 = (data: Uint8Array, o: number): number =>
	new DataView(data.buffer, data.byteOffset + o, 4).getFloat32(0, true);

const hasMagic = (data: Uint8Array, o: number, magic: string): boolean => {
	for (let i = 0; i < magic.length; i += 1) {
		if (data[o + i] !== magic.charCodeAt(i)) return false;
	}
	return true;
};

const findMagic = (data: Uint8Array, magic: string): number => {
	for (let i = 0; i + magic.length <= data.length; i += 1) {
		if (hasMagic(data, i, magic)) return i;
	}
	return -1;
};

type NamedRecord = {
	readonly end: number;
	readonly name: string;
	readonly count: number;
	readonly entries: readonly FactEntry[];
};

/**
 * Parse one *named* fact record at `at`, or `undefined` when the bytes are not
 * one. This is the 66/29 shape, which `64/27` also uses.
 */
const readNamedRecord = (
	data: Uint8Array,
	at: number,
): NamedRecord | undefined => {
	const header = data[at] ?? 0;
	if ((header & 0x80) === 0) return undefined;
	const length = header & 0x7f;
	if (length < 1 || at + 1 + length > data.length) return undefined;

	let nameStart = at + 1;
	if (data[nameStart] === 0x01) nameStart += 1; // the documented stray byte
	for (let i = 0; i < length; i += 1) {
		if ((data[nameStart + i] ?? 0) === 0) return undefined;
	}
	if (nameStart + length + 4 > data.length) return undefined;

	let name = "";
	for (let i = 0; i < length; i += 1) {
		name += String.fromCharCode(data[nameStart + i] ?? 0);
	}

	let p = nameStart + length;
	const count = u16(data, p + 2);
	if (count > MAX_ENTRIES) return undefined;
	p += 4;
	const entries: FactEntry[] = [];
	for (let i = 0; i < count; i += 1) {
		if (p + 10 > data.length) return undefined;
		entries.push({
			flag: u16(data, p),
			time: f32(data, p + 2),
			validFor: f32(data, p + 6),
		});
		p += 10;
	}
	return { end: p, name, count, entries };
};

/**
 * The first offset at or after `from` where **two** named records chain.
 *
 * The `64/27` fact DB interleaves a name-less record form that carries no
 * self-describing length, so the only reliable way to bound it is to resync on
 * the next run of named records. Requiring two in a row avoids latching onto a
 * stray `${0x80|len}` byte inside the name-less payload.
 */
const findNamedRun = (data: Uint8Array, from: number): number => {
	for (let at = from; at + 6 < data.length; at += 1) {
		const first = readNamedRecord(data, at);
		if (first === undefined) continue;
		if (readNamedRecord(data, first.end) !== undefined) return at;
	}
	return -1;
};

/**
 * Read the `"SBDF"` fact database, or `undefined` when the save has none.
 *
 * The named-record grammar is the same across generations. `64/27` additionally
 * interleaves name-less records; those are emitted as a fact with an empty name
 * and their bytes counted in `skippedBytes`, then the walk resyncs on the next
 * named run. Named records are never silently skipped: on `66/29` the walk reads
 * every declared record and the name-less branch is not taken at all.
 */
export const readFactDB = (data: Uint8Array): FactDB | undefined => {
	const offset = findMagic(data, "SBDF");
	if (offset < 0) return undefined;
	const declaredCount = readU32(data, offset + 4) ?? 0;
	if (declaredCount > MAX_RECORDS) return undefined;

	const facts: Fact[] = [];
	let at = offset + 8;
	let skippedBytes = 0;
	while (facts.length < declaredCount && at + 6 < data.length) {
		const recordOffset = at;
		const named = readNamedRecord(data, at);
		if (named !== undefined) {
			facts.push({
				offset: recordOffset,
				name: named.name,
				value: named.count,
				entries: named.entries,
				size: named.end - recordOffset,
			});
			at = named.end;
			continue;
		}
		const next = findNamedRun(data, at + 1);
		if (next < 0) break;
		facts.push({
			offset: recordOffset,
			name: "",
			value: 0,
			entries: [],
			size: next - recordOffset,
		});
		skippedBytes += next - recordOffset;
		at = next;
	}

	return {
		offset,
		declaredCount,
		facts,
		endOffset: at,
		terminated: hasMagic(data, at, "EBDF"),
		skippedBytes,
	};
};

/*
 * A name-keyed view of the DB was available here — last record for a repeated
 * name wins — and is deliberately not provided. `questProgress` in `./quests`
 * consumes `facts` as a list and folds it itself, because a quest's `total` and
 * `done` counts are over *records*, not over names: keying by name first would
 * silently drop the repeats that make those counts right.
 */
