/**
 * The contract every save editor on this site implements.
 *
 * There is one workbench component and one inspector; a game supplies a codec
 * and gets the whole page. That is only sound if the contract is narrow enough
 * to be honest about what a decoder can promise, so it is stated in terms of
 * round-tripping: `decode` and `encode` must be inverses, and the workbench
 * proves it on the user's actual file rather than on a fixture.
 */
import type { Bytes } from "./bytes";
import type { JsonValue, SavePath } from "./json";

/** A row in the "what is in this save" summary. */
export type SummaryRow = {
	readonly label: string;
	readonly value: string;
	/** Drawn as the accent colour when the value is worth noticing. */
	readonly emphasis?: boolean;
};

/**
 * One pending change, kept rather than applied.
 *
 * Staging rather than applying is inherited from the Crimson Desert editor and
 * is the reason a mistake here is recoverable: nothing touches the document
 * until the user re-encodes, and every edit carries the value it would replace
 * so the panel can offer a real undo.
 */
export type SaveEdit = {
	/** Stable identity for React keys and for de-duplicating repeat edits. */
	readonly id: string;
	readonly label: string;
	/** Where it lands, for display. Root replacement has an empty path. */
	readonly path: SavePath;
	readonly before: JsonValue;
	readonly after: JsonValue;
};

/**
 * A one-click change, expressed as a *plan* rather than a mutation.
 *
 * `plan` is pure and returns edits without touching anything. That is what
 * makes the quick actions testable — a test can assert the exact edits a button
 * would stage, which is the only part of a cheat that matters — and it is why
 * the workbench can show a preview before anything is staged.
 */
export type QuickAction = {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	/**
	 * Edits this action would stage, or an empty array when it does not apply
	 * to the loaded save. Returning `[]` is how an action greys itself out.
	 */
	plan: (doc: JsonValue) => readonly SaveEdit[];
};

/** A paragraph of the format story shown beside the drop target. */
export type FormatNote = {
	readonly title: string;
	readonly body: string;
};

export type SaveCodec = {
	/** Route slug, matching the app's directory name. */
	readonly id: string;
	/** The game, for the title and the summary header. */
	readonly game: string;
	/** The container format, e.g. "GVAS (Unreal Engine 5)". */
	readonly formatLabel: string;
	/** File extensions the picker should offer, without the dot. */
	readonly extensions: readonly string[];
	/** Where the game keeps the file, shown as a hint under the drop target. */
	readonly defaultPath: string;
	/**
	 * What the format actually does. The reverse engineering is the interesting
	 * part of these tools and it is what the page is for, so it is content
	 * rather than a tooltip.
	 */
	readonly notes: readonly FormatNote[];

	/**
	 * Bytes to a document. May be async (a codec that inflates or awaits
	 * WebCrypto) and may yield, so the workbench shows progress rather than
	 * freezing the tab.
	 */
	decode: (bytes: Bytes) => Promise<JsonValue>;
	/** A document back to bytes. The inverse of `decode`. */
	encode: (doc: JsonValue) => Promise<Bytes>;

	/** Headline facts about a loaded save. */
	summarise: (doc: JsonValue) => readonly SummaryRow[];
	/** Game-specific one-click changes. */
	readonly actions: readonly QuickAction[];
};
