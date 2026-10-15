import { bytesEqual } from "./bytes";
import type { SaveHeader } from "./container";
import { decodeSave, encodeSave } from "./container";

type OpenSave = {
	original: Uint8Array;
	header: SaveHeader;
};

type EditResult<T> = {
	payload: Uint8Array;
	value: T;
};

type EditVerification = {
	output_sha256: string;
	output_reopened: true;
	raw_payload_reopened_identically: true;
};

type CommittedSave = {
	bytes: Uint8Array;
	reopenedPayload: Uint8Array;
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

export const openSave = (sourceBytes: Uint8Array): Promise<OpenSave> => {
	return decodeSave(sourceBytes).then((decoded) => ({
		original: decoded.rawPayload,
		header: decoded.header,
	}));
};

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

export const transactSave = async <T>(
	sourceBytes: Uint8Array,
	label: string,
	edit: (open: OpenSave) => EditResult<T> | Promise<EditResult<T>>,
): Promise<EditedSave<T>> => {
	const open = await openSave(sourceBytes);
	const { payload, value } = await edit(open);
	return { ...(await commitSave(open, label, payload)), value };
};
