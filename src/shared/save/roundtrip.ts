import { type Bytes, bytesEqual, firstDifference } from "./bytes";
import { describeError } from "./errors";
import type { JsonValue } from "./json";
import { isJsonObject } from "./json";

export type RoundTripVerdict =
	| { readonly kind: "identical" }
	| { readonly kind: "lossless-edit" }
	| { readonly kind: "semantic" }
	| { readonly kind: "failed"; readonly reason: string };

const stableStringify = (value: JsonValue): string => {
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(",")}]`;
	}
	if (isJsonObject(value)) {
		const parts: string[] = [];
		for (const key of Object.keys(value).sort()) {
			const child = value[key];
			if (child === undefined) continue;
			parts.push(`${JSON.stringify(key)}:${stableStringify(child)}`);
		}
		const body = parts.join(",");
		return `{${body}}`;
	}
	return JSON.stringify(value) ?? "null";
};

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
