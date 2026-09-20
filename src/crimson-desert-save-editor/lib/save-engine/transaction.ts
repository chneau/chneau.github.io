/**
 * The one place a save edit touches the container.
 *
 * Every feature used to hand-roll the same steps: decode, build the edited
 * payload, re-encode, reopen the output, prove the reopened payload is
 * byte-identical, then hash it for the audit trail. Keeping that lifecycle in
 * one module means a new check (or a container edge case) is fixed once, and no
 * feature can skip the reopen proof.
 *
 * Edits that may legitimately decide to do nothing use `openSave` first and
 * only call `commitSave` once they know something changed, so a no-op still
 * returns the source bytes untouched.
 */

import { bytesEqual } from "./bytes";
import type { SaveHeader } from "./container";
import { decodeSave, encodeSave } from "./container";

/** A decoded save, ready to be edited and re-committed. */
type OpenSave = {
	/** The payload exactly as it was decoded; never mutated by the container. */
	original: Uint8Array;
	/** The header an edited payload is re-encoded with. */
	header: SaveHeader;
};

/** What an edit returns: the payload to write, plus anything it computed. */
type EditResult<T> = {
	payload: Uint8Array;
	value: T;
};

/** The verification fields every audit trail shares. */
type EditVerification = {
	output_sha256: string;
	output_reopened: true;
	raw_payload_reopened_identically: true;
};

type CommittedSave = {
	/** The re-encrypted save. */
	bytes: Uint8Array;
	/** The payload read back from `bytes`; identical to the payload written. */
	reopenedPayload: Uint8Array;
	/** Digest and reopen flags, ready to merge into an audit record. */
	verification: EditVerification;
};

type EditedSave<T> = CommittedSave & { value: T };

export const sha256Hex = async (data: Uint8Array): Promise<string> => {
	const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
	let output = "";
	for (const byte of new Uint8Array(digest)) {
		output += byte.toString(16).padStart(2, "0");
	}
	return output;
};

/** Decodes a save for editing. */
export const openSave = (sourceBytes: Uint8Array): Promise<OpenSave> => {
	return decodeSave(sourceBytes).then((decoded) => ({
		original: decoded.rawPayload,
		header: decoded.header,
	}));
};

/**
 * Re-encodes `payload` with the opened save's header and proves the result
 * reopens byte-identically before returning it.
 */
export const commitSave = async (
	open: OpenSave,
	label: string,
	payload: Uint8Array,
): Promise<CommittedSave> => {
	const bytes = await encodeSave(payload, open.header);
	const reopened = await decodeSave(bytes);
	if (!bytesEqual(reopened.rawPayload, payload)) {
		throw new Error(`${label} did not reopen byte-identically`);
	}
	return {
		bytes,
		reopenedPayload: reopened.rawPayload,
		verification: {
			output_sha256: await sha256Hex(bytes),
			output_reopened: true,
			raw_payload_reopened_identically: true,
		},
	};
};

/** `openSave` + edit + `commitSave`, for the common "always changes" case. */
export const transactSave = async <T>(
	sourceBytes: Uint8Array,
	label: string,
	edit: (open: OpenSave) => EditResult<T> | Promise<EditResult<T>>,
): Promise<EditedSave<T>> => {
	const open = await openSave(sourceBytes);
	const { payload, value } = await edit(open);
	return { ...(await commitSave(open, label, payload)), value };
};
