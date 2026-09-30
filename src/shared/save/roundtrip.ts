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
import type { JsonValue } from "./json";

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
			reason: `Could not rebuild the save: ${
				cause instanceof Error ? cause.message : String(cause)
			}`,
		};
	}

	let reread: JsonValue;
	try {
		reread = await codec.decode(rebuilt);
	} catch (cause) {
		return {
			kind: "failed",
			reason: `The rebuilt save did not read back: ${
				cause instanceof Error ? cause.message : String(cause)
			}`,
		};
	}

	if (JSON.stringify(reread) !== JSON.stringify(document)) {
		const at = firstDifference(
			new TextEncoder().encode(JSON.stringify(document)),
			new TextEncoder().encode(JSON.stringify(reread)),
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
