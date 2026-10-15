import { readFooter, readU32 } from "./inner";
import { readNameTable } from "./names";
import { readTokenAt, type Token } from "./tokens";

type Span = {
	readonly offset: number;
	readonly size: number;
	readonly end: number;
	readonly token: Token;
	readonly header: number;
};

export type ObjectNode = {
	readonly span: Span;
	readonly children: ObjectNode[];
};

type ObjectTree = {
	readonly roots: ObjectNode[];
	readonly nodes: number;
	readonly maxDepth: number;
	readonly declared: number;
	readonly resolved: number;
	readonly unresolved: number;
};

const BASE = 3084;

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

export const readObjectTree = (data: Uint8Array): ObjectTree => {
	const names = readNameTable(data).names;

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

	const footer = readFooter(data).variableTableOffset;
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
		declared: declaredCount,
		resolved: spans.length,
		unresolved,
	};
};
