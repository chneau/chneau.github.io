/**
 * `MANU` — the variable-name table, and the single most valuable structure in
 * the file.
 *
 * The engine's C++ property names, in file order, spelled out:
 * `Entity`, `nP`, `Uint32`, `isAvailable`, `Bool`, `isInteractive` … This is
 * the schema that names everything else in the save. Nothing downstream can be
 * read without it, because a token that refers to "property 6,384" is
 * meaningless until property 6,384 has a name.
 *
 * Layout, measured on the reference save:
 *
 * ```
 *   13,508,213  "MANU"
 *   13,508,217  u32  count   = 20589
 *   13,508,221  u32  unknown = 0
 *   13,508,225  count x (u8 length, `length` bytes of 7-bit ASCII)
 *   13,884,369  u32  zero padding
 *   13,884,373  "ENOD"
 * ```
 *
 * 376,160 bytes for 20,589 names. The `u32` at +8 is read as an opaque field
 * rather than a count or a version: it is 0 on this save and nothing in the file
 * says what a non-zero value would mean.
 *
 * The 4 bytes between the last name and `ENOD` are all zero, and they are
 * measured rather than inferred: walking the 20,589 names from
 * `NAME_TABLE_HEADER_BYTES` lands on 13,884,369, four bytes short of the `ENOD`
 * the search finds at 13,884,373. `readNameTable` does not depend on them — it
 * stops at `declaredCount` or at `endOffset`, whichever comes first — but they
 * belong in the layout because a reader reconstructing the table needs to know
 * they are there, and because `endOffset - offset` is reported as the table's
 * byte count.
 */

import { readAscii, readU32 } from "./inner";

/** Magic opening the name table. */
const MANU_MAGIC = "MANU";

/** Magic closing the name table. */
const ENOD_MAGIC = "ENOD";

/** Bytes between the `MANU` magic and the first name: u32 count + u32 unknown. */
const NAME_TABLE_HEADER_BYTES = 12;

type NameTable = {
	/** offset of "MANU" */
	readonly offset: number;
	/** offset of "ENOD" */
	readonly endOffset: number;
	/** 20589 */
	readonly declaredCount: number;
	/** in file order */
	readonly names: readonly string[];
	/** names actually parsed */
	readonly count: number;
	/** declaredCount !== count */
	readonly truncated: boolean;
};

/**
 * Find an ASCII magic. Searches forward, so it must only be used for a magic the
 * sample contains exactly once — which both of these do (`MANU` once, `ENOD`
 * once, verified over the whole 15 MB stream). A magic that occurs thousands of
 * times needs the backwards, EOF-anchored search `readFooter` uses instead.
 */
const indexOfMagic = (data: Uint8Array, magic: string, from = 0): number => {
	const needle = [...magic].map((c) => c.charCodeAt(0));
	const limit = data.length - needle.length;
	for (let at = Math.max(0, from); at <= limit; at += 1) {
		if (needle.every((byte, i) => data[at + i] === byte)) return at;
	}
	return -1;
};

/**
 * Read the `MANU` name table.
 *
 * ## The walk is defensive, because a length byte is the only thing standing
 * between a truncated name and an infinite loop
 *
 * Each name is a u8 length then that many bytes. A single corrupt or misaligned
 * length byte would otherwise run the walk off the end of the table and keep
 * going, emitting thousands of nonsense names and reporting `count` as though it
 * were real. Three independent stops, each for a different failure:
 *
 * 1. **a length byte of 0** — not an empty name (no empty name is ever stored)
 *    but the "nothing follows" marker that terminates a damaged table;
 * 2. **a name that would overrun `ENOD`** — the table is self-delimiting, so the
 *    end marker is a stronger bound than the byte count;
 * 3. **the declared count reached** — the file's own statement of how many
 *    names exist.
 *
 * A length byte above 255 cannot occur through this reader — the length is a
 * `Uint8Array` element — so there is no separate test for it; the overrun check
 * covers what that requirement is protecting against, which is a length that
 * does not fit where it claims to.
 *
 * `truncated` reports the truth rather than the file's claim: if fewer than
 * `declaredCount` names parsed, `truncated` is `true` and `count` is the number
 * actually recovered. A caller that trusts `declaredCount` over `count` will
 * index past the end of `names` and get `undefined` where it expected a name.
 *
 * Throws when the `MANU` magic is absent: there is no table to describe, and an
 * empty one would be indistinguishable from a save that genuinely has no names.
 */
export const readNameTable = (data: Uint8Array): NameTable => {
	const offset = indexOfMagic(data, MANU_MAGIC);
	if (offset < 0) {
		throw new Error(
			`no ${JSON.stringify(MANU_MAGIC)} name table in ${data.length} bytes`,
		);
	}
	const endOffset = indexOfMagic(data, ENOD_MAGIC, offset + 4);
	if (endOffset < 0) {
		throw new Error(
			`${JSON.stringify(MANU_MAGIC)} at ${offset} is not closed by ${JSON.stringify(
				ENOD_MAGIC,
			)}`,
		);
	}
	const declaredCount = readU32(data, offset + 4) ?? 0;

	const names: string[] = [];
	let at = offset + NAME_TABLE_HEADER_BYTES;
	for (let i = 0; i < declaredCount && at < endOffset; i += 1) {
		const length = data[at] ?? 0;
		if (length === 0) break; // stop (1) above
		const start = at + 1;
		if (start + length > endOffset) break; // stop (2)
		names.push(readAscii(data, start, length));
		at = start + length;
	}

	return {
		offset,
		endOffset,
		declaredCount,
		names,
		count: names.length,
		truncated: names.length !== declaredCount,
	};
};

/*
 * A search over the name table used to stand here and is gone. Its rules are
 * format knowledge rather than code, so they are kept:
 *
 * Such a search is a **substring** match, not equality, because the question the
 * table is asked is "which properties mention health?" and the answers are
 * `W3Effect_LowHealth`, `healthRegen`, `healthPoints` — none of which is
 * literally "health". Matching is **case-sensitive**: these are C++ identifiers
 * and resource keys, where case is significant throughout. Results come back in
 * ascending index order, which is the table's own order, so a caller can read
 * `table.names[i]` for any `i` in the result without a bounds check.
 */
