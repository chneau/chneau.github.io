export type JsonValue =
	| { readonly [key: string]: JsonValue }
	| readonly JsonValue[]
	| string
	| number
	| boolean
	| null;

export type PathSegment = string | number;

export type SavePath = readonly PathSegment[];

export const isJsonObject = (
	value: JsonValue,
): value is { readonly [key: string]: JsonValue } =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const fieldAt = (
	value: JsonValue | undefined,
	key: string,
): JsonValue | undefined =>
	value === undefined
		? undefined
		: isJsonObject(value)
			? value[key]
			: undefined;

export const objectAt = (
	value: JsonValue | undefined,
	key: string,
): { readonly [key: string]: JsonValue } | undefined => {
	const found = fieldAt(value, key);
	return found !== undefined && isJsonObject(found) ? found : undefined;
};

export const numberAt = (
	value: JsonValue | undefined,
	key: string,
): number | undefined => {
	const found = fieldAt(value, key);
	return typeof found === "number" ? found : undefined;
};

export const stringAt = (
	value: JsonValue | undefined,
	key: string,
): string | undefined => {
	const found = fieldAt(value, key);
	return typeof found === "string" ? found : undefined;
};

export const arrayAt = (
	value: JsonValue | undefined,
	key: string,
): readonly JsonValue[] | undefined => {
	const found = fieldAt(value, key);
	return Array.isArray(found) ? found : undefined;
};

export const requireNumberAt = (value: JsonValue, key: string): number => {
	const found = fieldAt(value, key);
	if (typeof found !== "number" || !Number.isFinite(found)) {
		throw new Error(`"${key}" must be a finite number.`);
	}
	return found;
};

export const requireStringAt = (value: JsonValue, key: string): string => {
	const found = fieldAt(value, key);
	if (typeof found !== "string") {
		throw new Error(`"${key}" must be a string.`);
	}
	return found;
};

export const requireArrayAt = (
	value: JsonValue,
	key: string,
): readonly JsonValue[] => {
	const found = fieldAt(value, key);
	if (!Array.isArray(found)) {
		throw new Error(`"${key}" must be an array.`);
	}
	return found;
};

export const requireObjectAt = (
	value: JsonValue,
	key: string,
): { readonly [key: string]: JsonValue } => {
	const found = objectAt(value, key);
	if (found === undefined) {
		throw new Error(`"${key}" must be an object.`);
	}
	return found;
};

export const getAtPath = (
	root: JsonValue,
	path: SavePath,
): JsonValue | undefined => {
	let current: JsonValue | undefined = root;
	for (const segment of path) {
		if (current === undefined) return undefined;
		if (typeof segment === "number") {
			current = Array.isArray(current) ? current[segment] : undefined;
		} else {
			current = isJsonObject(current) ? current[segment] : undefined;
		}
	}
	return current;
};

export const setAtPath = (
	root: JsonValue,
	path: SavePath,
	value: JsonValue,
): JsonValue => {
	const [head, ...rest] = path;
	if (head === undefined) {
		return value;
	}
	if (typeof head === "number") {
		if (!Array.isArray(root)) {
			throw new Error(`Cannot set index ${head} on a non-array.`);
		}
		const next = root.slice();
		const existing = next[head];
		if (existing === undefined) {
			throw new Error(`Index ${head} is not present in this save.`);
		}
		next[head] = rest.length === 0 ? value : setAtPath(existing, rest, value);
		return next;
	}
	if (!isJsonObject(root)) {
		throw new Error(`Cannot set key "${head}" on a non-object.`);
	}
	const existing = root[head];
	if (existing === undefined) {
		throw new Error(`Path "${head}" is not present in this save.`);
	}
	return {
		...root,
		[head]: rest.length === 0 ? value : setAtPath(existing, rest, value),
	};
};

type JsonLeaf = {
	readonly path: SavePath;
	readonly value: JsonValue;
	readonly weight: number;
};

const weightOf = (value: JsonValue): number => {
	if (typeof value === "string") return value.length;
	if (typeof value === "number") return 8;
	if (typeof value === "boolean" || value === null) return 4;
	return 0;
};

export const collectLeaves = (
	root: JsonValue,
	maxDepth = 64,
): readonly JsonLeaf[] => {
	const leaves: JsonLeaf[] = [];
	const walk = (value: JsonValue, path: SavePath, depth: number): void => {
		if (depth > maxDepth) return;
		if (Array.isArray(value)) {
			for (const [index, item] of value.entries()) {
				walk(item, [...path, index], depth + 1);
			}
			return;
		}
		if (isJsonObject(value)) {
			for (const [key, item] of Object.entries(value)) {
				walk(item, [...path, key], depth + 1);
			}
			return;
		}
		leaves.push({ path, value, weight: weightOf(value) });
	};
	walk(root, [], 0);
	return leaves;
};

export const formatPath = (path: SavePath): string =>
	path
		.map((segment, index) =>
			typeof segment === "number"
				? `[${segment}]`
				: index === 0
					? segment
					: `.${segment}`,
		)
		.join("");
