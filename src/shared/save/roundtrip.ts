/**
 * Proof that a rebuilt save is a save.
 *
 * The hazard these editors exist to avoid is a file that decodes, encodes and
 * then quietly fails to load in the game — a dropped field, a re-serialised
 * structure in a different key order, a checksum computed over the wrong
 * range. None of that shows up in a type checker, and none of it is visible
 * until the game refuses the file.
 *
 * So a rebuilt save is verified before it is offered, by decoding it again and
 * comparing, and the result is shown to the user rather than assumed.
 */
import { type Bytes, bytesEqual, firstDifference } from "./bytes";
import { describeError } from "./errors";
import type { JsonValue } from "./json";
import { isJsonObject } from "./json";

export type RoundTripVerdict =
	/** Re-encoding the untouched save reproduced it byte for byte. */
	| { readonly kind: "identical" }
	/** Re-encoding reproduced the exact bytes. The strongest possible result. */
	| { readonly kind: "lossless-edit" }
	/**
	 * The rebuilt file decodes to the intended document, but is not byte
	 * identical to the input. Legitimate after an edit — a counter or a
	 * timestamp legitimately differs — and still safe to use.
	 */
	| { readonly kind: "semantic" }
	/** The rebuilt file does not decode back to the intended document. */
	| { readonly kind: "failed"; readonly reason: string };

/**
 * `JSON.stringify` with every object's keys in sorted order, so two documents
 * that carry the same keys and values compare equal however the codec happened
 * to write them out.
 *
 * Key order is not part of a JSON document — a codec that emits a struct's
 * fields alphabetically, or that rebuilds a node tree from an unordered map,
 * decodes back to the document that was intended, and the verdict for that is
 * `semantic`, not `failed`. Comparing the raw serialisations reported a
 * correctly-rebuilt save as broken, which is the one answer this function must
 * never give wrongly.
 */
const stableStringify = (value: JsonValue): string => {
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(",")}]`;
	}
	if (isJsonObject(value)) {
		const parts: string[] = [];
		for (const key of Object.keys(value).sort()) {
			const child = value[key];
			// An own key always reads back a value; the guard is what
			// `noUncheckedIndexedAccess` demands, not a claim about the document.
			if (child === undefined) continue;
			parts.push(`${JSON.stringify(key)}:${stableStringify(child)}`);
		}
		const body = parts.join(",");
		return `{${body}}`;
	}
	// A `JsonValue` scalar always stringifies; the `?? "null"` is only there
	// because TypeScript cannot tell that from the type alone.
	return JSON.stringify(value) ?? "null";
};

/**
 * Verifies a rebuilt file.
 *
 * `original` is the file the user opened, `rebuilt` what is about to be handed
 * back, and `intended` the document the edits asked for. The check is on the
 * document rather than the bytes, because bytes differing is expected once
 * anything is edited while the document differing is the actual defect.
 */
export const verifyRoundTrip = async (
	codec: {
		decode: (bytes: Bytes) => Promise<JsonValue>;
		encode: (doc: JsonValue) => Promise<Bytes>;
	},
	original: Bytes,
	document: JsonValue,
	editsApplied: boolean,
): Promise<RoundTripVerdict> => {
	let rebuilt: Bytes;
	try {
		rebuilt = await codec.encode(document);
	} catch (cause) {
		return {
			kind: "failed",
			reason: `Could not rebuild the save: ${describeError(cause)}`,
		};
	}

	let reread: JsonValue;
	try {
		reread = await codec.decode(rebuilt);
	} catch (cause) {
		return {
			kind: "failed",
			reason: `The rebuilt save did not read back: ${describeError(cause)}`,
		};
	}

	if (stableStringify(reread) !== stableStringify(document)) {
		const at = firstDifference(
			new TextEncoder().encode(stableStringify(document)),
			new TextEncoder().encode(stableStringify(reread)),
		);
		return {
			kind: "failed",
			reason:
				at === undefined
					? "The rebuilt save did not read back to the values you set."
					: `The rebuilt save read back differently, first at character ${at}.`,
		};
	}

	if (bytesEqual(original, rebuilt)) {
		return editsApplied ? { kind: "lossless-edit" } : { kind: "identical" };
	}
	return { kind: "semantic" };
};

/** One line describing a verdict, in the user's terms rather than ours. */
export const describeVerdict = (verdict: RoundTripVerdict): string => {
	switch (verdict.kind) {
		case "identical":
			return "Unchanged saves rebuild to the exact same bytes.";
		case "lossless-edit":
			return "Your edits were rebuilt and verified byte for byte.";
		case "semantic":
			return "Your edits were rebuilt and read back correctly.";
		case "failed":
			return verdict.reason;
	}
};
