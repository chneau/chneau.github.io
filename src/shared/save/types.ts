import type { Bytes } from "./bytes";
import type { JsonValue, SavePath } from "./json";

export type SummaryRow = {
	readonly label: string;
	readonly value: string;
	readonly emphasis?: boolean;
};

export type SaveEdit = {
	readonly id: string;
	readonly label: string;
	readonly path: SavePath;
	readonly before: JsonValue;
	readonly after: JsonValue;
};

export type QuickAction = {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	plan: (doc: JsonValue) => readonly SaveEdit[];
};

export type FormatNote = {
	readonly title: string;
	readonly body: string;
};

export type SaveTableColumn = {
	readonly label: string;
	readonly path: SavePath;
	readonly readOnly?: boolean;
	readonly width?: string;
};

export type SaveTable = {
	readonly id: string;
	readonly label: string;
	readonly path: SavePath;
	readonly columns: readonly SaveTableColumn[];
};

export type SaveCodec = {
	readonly game: string;
	readonly formatLabel: string;
	readonly extensions: readonly string[];
	readonly defaultPath: string;
	readonly notes: readonly FormatNote[];

	decode: (bytes: Bytes) => Promise<JsonValue>;
	encode: (doc: JsonValue) => Promise<Bytes>;

	summarise: (doc: JsonValue) => readonly SummaryRow[];
	readonly actions: readonly QuickAction[];
	readonly tables?: readonly SaveTable[];
};
