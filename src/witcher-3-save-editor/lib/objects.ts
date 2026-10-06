/**
 * The object tree, rebuilt from the engine's span index.
 *
 * The save ends with an `"SC"` index — `u32 count` then `count × (u32, u32)`,
 * ending exactly at `len - 6` — whose entries are `(start + 3084, size)`. It
 * indexes every serialised object and leaf value in one flat, post-order list.
 * Resolving each entry to the token at `start` and nesting by containment
 * recovers the whole object graph: on the reference `66/29` save,
 * 75,183 spans nest into 35 roots at depth 27, and the roots are the real
 * top-level objects (`CWitcherGameResource`, `saveInfo`, `facts`,
 * `questSystem`, `universe`, …).
 *
 * The **variable table** the footer points at is a smaller (6,864-entry) list
 * and gives a fragmented tree; it is kept as a fallback only for a save with no
 * `"SC"` index.
 */

import { readFooter, readU32 } from "./inner";
import { readNameTable } from "./names";
import { readTokenAt, type Token } from "./tokens";

/** One serialised object or leaf value, located in the decompressed stream. */
type Span = {
	readonly offset: number;
	readonly size: number;
	readonly end: number;
	readonly token: Token;
	/** bytes of container header the entry's offset counts: 0/4/6/10 */
	readonly header: number;
};

/** One node of the object forest, with the spans it contains. */
export type ObjectNode = {
	readonly span: Span;
	readonly children: ObjectNode[];
};

type ObjectTree = {
	readonly roots: ObjectNode[];
	readonly nodes: number;
	readonly maxDepth: number;
	/** entries the table declares */
	readonly declared: number;
	/** entries that resolved to a token start */
	readonly resolved: number;
	/** entries that are leaf values, not token starts (SC), or unresolved spans */
	readonly unresolved: number;
};

/**
 * The `"SC"` index stores `start + BASE`; the variable-table fallback stores
 * `field1 = end + BASE + header`. Same constant, read two ways.
 */
const BASE = 3084;

/**
 * The `"SC"` span index, if present: `"SC" | u32 count | count × (u32, u32)`
 * whose records end exactly at `len - 6`.
 *
 * This is the engine's **full** span index — one entry per serialised object and
 * leaf value — and it is what the object tree should be built from. The variable
 * table the footer points at is a much smaller (6,864-entry) list and produces a
 * fragmented tree. Entries are `(start + BASE, size)`.
 */
const findSpanIndex = (
	data: Uint8Array,
): { readonly offset: number; readonly count: number } | undefined => {
	for (let i = 0; i + 6 < data.length; i += 1) {
		if (data[i] !== 0x53 || data[i + 1] !== 0x43) continue;
		const count = readU32(data, i + 2) ?? 0;
		if (i + 6 + count * 8 === data.length - 6) return { offset: i, count };
	}
	return undefined;
};

/**
 * Resolve one table entry to its span.
 *
 * Try each candidate header; an entry is *exact* when the leaf's byte size
 * matches, or a `BLCK`/`SS` header plus children equals `size`. Exact wins; a
 * token that merely starts there is still accepted (the span size is taken from
 * the table), which is how the object tree closes `BS` frames, whose size the
 * token stream does not carry. `undefined` means no header lands on a token —
 * one of the per-object-origin stragglers.
 */
const resolveSpan = (
	data: Uint8Array,
	names: readonly string[],
	size: number,
	off: number,
): Span | undefined => {
	const candidates: {
		header: number;
		start: number;
		token: Token;
		exact: boolean;
	}[] = [];
	for (const header of [0, 6, 10, 4]) {
		const start = off - size - BASE - header;
		// `start + size > data.length` is checked here and not only at the call
		// site because the SC branch above enforces exactly this bound and the
		// fallback did not, so a corrupt variable table could produce a span that
		// runs past the buffer. `buildObjectTree` then never pops it — it absorbs
		// every later span as a child — and every consumer slices by `span.end`.
		if (start < 0 || size <= 0 || start + size > data.length) continue;
		const token = readTokenAt(data, names, start);
		if (token === undefined) continue;
		const exact =
			(header === 0 && token.size === size) ||
			(header === 6 &&
				token.tag === "SS" &&
				6 + (token.childSize ?? 0) === size) ||
			(header === 10 &&
				token.tag === "BLCK" &&
				10 + (token.childSize ?? 0) === size) ||
			(header === 4 && token.tag === "BS");
		candidates.push({ header, start, token, exact });
	}
	// Prefer an exact match, then the smallest header.
	candidates.sort((a, b) =>
		a.exact === b.exact ? a.header - b.header : a.exact ? -1 : 1,
	);
	const pick = candidates[0];
	if (pick === undefined) return undefined;
	return {
		offset: pick.start,
		size,
		end: pick.start + size,
		token: pick.token,
		header: pick.header,
	};
};

/**
 * Nest a set of spans into a forest.
 *
 * Sorted by start (ties: larger first), each span becomes a child of the
 * innermost open span that contains it, or a root. `maxDepth` is the deepest
 * stack, a cheap proxy for tree depth.
 *
 * The type of the forest's roots is named rather than written as
 * `ReturnType<typeof readObjectTree>["roots"]` at the call sites: an inferred
 * shape that appears in three modules' signatures is a contract, and a contract
 * with no name is one nobody can annotate.
 */
const buildObjectTree = (spans: readonly Span[]): ObjectTree => {
	const sorted = [...spans].sort(
		(a, b) => a.offset - b.offset || b.size - a.size,
	);
	const roots: ObjectNode[] = [];
	const stack: ObjectNode[] = [];
	let maxDepth = 0;
	for (const span of sorted) {
		while (
			stack.length > 0 &&
			span.offset >= (stack[stack.length - 1]?.span.end ?? 0)
		) {
			stack.pop();
		}
		const parent = stack[stack.length - 1];
		const node: ObjectNode = { span, children: [] };
		if (
			parent !== undefined &&
			parent.span.offset <= span.offset &&
			span.end <= parent.span.end
		) {
			parent.children.push(node);
		} else {
			roots.push(node);
		}
		stack.push(node);
		if (stack.length > maxDepth) maxDepth = stack.length;
	}
	return {
		roots,
		nodes: sorted.length,
		maxDepth,
		declared: spans.length,
		resolved: spans.length,
		unresolved: 0,
	};
};

/** Read the span index and build the object tree for a whole save. */
export const readObjectTree = (data: Uint8Array): ObjectTree => {
	const names = readNameTable(data).names;

	// Prefer the engine's full `"SC"` index: `(start + BASE, size)`, one entry per
	// object or leaf value. `start` is the token offset directly, so no header
	// search is needed and nothing is ambiguous.
	const index = findSpanIndex(data);
	if (index !== undefined) {
		const spans: Span[] = [];
		let leafValues = 0;
		for (let i = 0; i < index.count; i += 1) {
			const start = (readU32(data, index.offset + 6 + i * 8) ?? 0) - BASE;
			const size = readU32(data, index.offset + 6 + i * 8 + 4) ?? 0;
			if (start < 0 || start + size > data.length) {
				leafValues += 1;
				continue;
			}
			const token = readTokenAt(data, names, start);
			if (token === undefined) {
				// A leaf value inside a token (a 4-byte int, a 16-byte GUID).
				leafValues += 1;
				continue;
			}
			spans.push({ offset: start, size, end: start + size, token, header: 0 });
		}
		const tree = buildObjectTree(spans);
		return {
			...tree,
			nodes: spans.length,
			declared: index.count,
			resolved: spans.length,
			unresolved: leafValues,
		};
	}

	// Fallback: the smaller variable table the footer points at. It resolves via
	// `field1 = end + base + header` with a header search.
	//
	// ## The table's raw order is not sorted, and that is not a bug to tidy away
	//
	// This is the hazard the inline read above is shaped around, so it is stated
	// here where the read is. The reference save opens
	// `(14, 6879) (7, 6886) (8, 6894) (14, 6908)`. The **first** field takes only
	// three distinct values (14 × 2289, 7 × 2288, 8 × 2288) and cycles
	// 14, 7, 8, 14, 7, 8 …, while the second ascends monotonically
	// (6879, 6886, 6894, 6908 …) with `first[i] === second[i] - second[i-1]` for
	// every `i > 0`. The pair is therefore `(length of the previous span, end of
	// this span)`, and the file's "unsorted" first column is a delta, not an
	// address.
	//
	// **So `second` is the end offset and `first` is the span length** — which is
	// what `resolveSpan` is handed (`size`, then `off`) and why it adds the base
	// and searches for a header rather than trusting `off` to be a position.
	// A consumer that treated the first column as a position to seek to, or
	// binary-searched these rows, would be wrong *silently*: the values are
	// small, plausible, and typecheck.
	const footer = readFooter(data).variableTableOffset;
	// The declared count is **attacker-controlled** and must be bounded by what the
	// buffer can hold. Unbounded, a 36-byte file declaring `0xffffffff` records
	// looped ~4.3 billion times and hung the tab for about 100 seconds — measured,
	// and reachable through `./format`'s `readObjectTree(container.data)` on every
	// decode. The SC branch above is implicitly bounded by its exact-length check;
	// this one was not bounded at all. Each record is 8 bytes at `footer + 4`.
	const declaredCount = readU32(data, footer) ?? 0;
	const fits = Math.max(0, Math.floor((data.length - footer - 4) / 8));
	const count = Math.min(declaredCount, fits);
	const spans: Span[] = [];
	let unresolved = 0;
	for (let i = 0; i < count; i += 1) {
		const size = readU32(data, footer + 4 + i * 8) ?? 0;
		const off = readU32(data, footer + 4 + i * 8 + 4) ?? 0;
		const span = resolveSpan(data, names, size, off);
		if (span === undefined) unresolved += 1;
		else spans.push(span);
	}
	const tree = buildObjectTree(spans);
	return {
		...tree,
		nodes: spans.length,
		// The file's own figure, not the capped one — `facts.ts` reports its
		// `declaredCount` the same way. `resolved + unresolved` falling short of it
		// is the honest signal that the table claims more records than the buffer
		// can hold, which is the state the cap exists to survive rather than hide.
		declared: declaredCount,
		resolved: spans.length,
		unresolved,
	};
};
