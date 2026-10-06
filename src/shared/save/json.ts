/**
 * A JSON-like document, the one shape every decoded save on this site is
 * projected onto.
 *
 * Five of the six formats decode straight to JSON (DYSMANTLE's XML is parsed
 * into it, Cyberpunk's node tree is walked into it), and the sixth — CERIMAL —
 * is a self-describing binary format that also resolves to a tree. Modelling
 * the *document* rather than each game's own struct is what lets one
 * workbench, one inspector and one staged-edit list serve all of them; the
 * game-specific knowledge lives in each app's `summarise` and `actions`,
 * never in the editing machinery.
 *
 * `readonly` throughout because a decoded save is a value: edits produce a new
 * document rather than mutating one a render already read. That is what makes
 * "re-encode, decode again, compare" a meaningful proof rather than a tautology.
 */
export type JsonValue =
	| { readonly [key: string]: JsonValue }
	| readonly JsonValue[]
	| string
	| number
	| boolean
	| null;

/** One step of an address into a document: an object key or an array index. */
export type PathSegment = string | number;

/**
 * A path is an array rather than a dotted string because array indices and
 * object keys share the character set — a save full of numeric-looking keys
 * (`"0"`, `"1"`) would be ambiguous to re-parse. Keeping the segments typed
 * removes the ambiguity at the type level.
 */
export type SavePath = readonly PathSegment[];

/** Narrows to a JSON object, excluding arrays (which are also indexable). */
export const isJsonObject = (
	value: JsonValue,
): value is { readonly [key: string]: JsonValue } =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * A field reader, for the codes that walk a decoded document without pretending
 * it is a typed one.
 *
 * `summarise` and `plan` receive a `JsonValue`, because that is all the
 * workbench contract promises, and a cast to a game's own `GvasSave` would
 * silence the one thing worth checking — that the document really is the save
 * this codec decoded. These readers walk it defensively instead: an absent key
 * and a value of the wrong shape are both `undefined`, because to a decoder
 * that has lost the document's shape they are the same thing. Each codec had
 * its own copy of `objectAt` and friends; this is the one they now share.
 */
const fieldAt = (
	value: JsonValue | undefined,
	key: string,
): JsonValue | undefined =>
	value === undefined
		? undefined
		: isJsonObject(value)
			? value[key]
			: undefined;

/** The object at `key`, or `undefined` when it is absent or not an object. */
export const objectAt = (
	value: JsonValue | undefined,
	key: string,
): { readonly [key: string]: JsonValue } | undefined => {
	const found = fieldAt(value, key);
	return found !== undefined && isJsonObject(found) ? found : undefined;
};

/** The number at `key`, or `undefined` when it is absent or not a number. */
export const numberAt = (
	value: JsonValue | undefined,
	key: string,
): number | undefined => {
	const found = fieldAt(value, key);
	return typeof found === "number" ? found : undefined;
};

/** The string at `key`, or `undefined` when it is absent or not a string. */
export const stringAt = (
	value: JsonValue | undefined,
	key: string,
): string | undefined => {
	const found = fieldAt(value, key);
	return typeof found === "string" ? found : undefined;
};

/** The array at `key`, or `undefined` when it is absent or not an array. */
export const arrayAt = (
	value: JsonValue | undefined,
	key: string,
): readonly JsonValue[] | undefined => {
	const found = fieldAt(value, key);
	return Array.isArray(found) ? found : undefined;
};

/**
 * The throwing counterparts, for the encode half of a codec.
 *
 * The inspector replaces leaves in place, so every field has to be *checked* on
 * the way out rather than assumed; a document that has lost one is refused with
 * a message naming it, which is a better outcome than a cast and a file the game
 * silently rejects.
 */
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

/**
 * Reads the value at `path`, or `undefined` if any step is missing or is not
 * traversable. Callers get `undefined` rather than a throw because a path
 * naming a field this save does not have is an ordinary outcome, not an error.
 */
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

/**
 * Returns a copy of `root` with `path` set to `value`, sharing every untouched
 * branch with the original.
 *
 * Copy-on-write rather than mutation, for the reason in `JsonValue`: the
 * previous document stays a faithful record of what was on disk, so the staged
 * edit list can always show a real "before" and the round-trip proof can
 * compare against it.
 *
 * A path that does not resolve in the input is an error rather than a create,
 * because these tools edit saves — inventing a key the game never wrote is how
 * a rebuilt file stops loading.
 */
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
		// The same rule the object branch below enforces, and it was missing here:
		// an index past the end — or at the end — is not a path that resolves, so
		// it must not be invented. Writing it made the engine's own array extend
		// and fill the gap with `null`, which is precisely the "invent a key the
		// game never wrote" this function's doc warns about, and the round-trip
		// check cannot catch it: the invented holes are in the document it compares
		// against. `getAtPath` on the same path already reports `undefined`, so the
		// two disagreed.
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

/** A leaf the inspector can show, and the staged-edit list can name. */
type JsonLeaf = {
	readonly path: SavePath;
	readonly value: JsonValue;
	/** Byte-ish size of the rendered value, used to rank big fields first. */
	readonly weight: number;
};

/** Rough rendered size, so the inspector can fold away the noisy bulk. */
const weightOf = (value: JsonValue): number => {
	if (typeof value === "string") return value.length;
	if (typeof value === "number") return 8;
	if (typeof value === "boolean" || value === null) return 4;
	return 0;
};

/**
 * Walks the document and yields every scalar leaf, depth-first, in document
 * order.
 *
 * Guards against a cyclic or pathologically deep structure by refusing to
 * descend past `maxDepth`: a decoded save is attacker-adjacent data in the
 * sense that it came off someone's disk, and a recursive walk that trusts its
 * input is a stack-overflow crash on a file the workbench cannot otherwise
 * reject.
 */
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

/**
 * Renders a path for display: object keys keep their own characters, array
 * indices are bracketed so `inv[3]` never reads like the key `"inv3"`.
 */
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
