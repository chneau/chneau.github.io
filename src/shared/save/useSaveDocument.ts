/**
 * The workbench's load/rebuild state machine, apart from its layout.
 *
 * What is hard about a save editor — parsing a save, staging edits without
 * touching the document, proving a rebuild reads back before it is offered —
 * is identical across the six formats, and it lived inside `SaveWorkbench`
 * beside the markup. It is a hook now so the component is what it looks like:
 * a landing screen and a workspace, each wired to the values below.
 *
 * The document is deliberately returned *derived*. `working` is a function of
 * the loaded bytes and the staged edits, and keeping it a render-time
 * computation is what stops a render reading a document a previous render
 * changed.
 */
import { notifications } from "@mantine/notifications";
import { useCallback, useMemo, useState } from "react";
import type { Bytes } from "./bytes";
import { applyEdits, stageEdits, withoutPath } from "./edits";
import { downloadBytes, readFileBytes, rebuiltName } from "./file";
import { formatPath, type JsonValue } from "./json";
import {
	describeVerdict,
	type RoundTripVerdict,
	verifyRoundTrip,
} from "./roundtrip";
import type { SaveCodec, SaveEdit, SummaryRow } from "./types";

/**
 * Everything the workbench's two layouts read.
 *
 * `working`, `stagedPaths` and `summary` are derived during render rather than
 * stored, so a render can never observe a half-applied document.
 */
type SaveDocument = {
	readonly name: string | null;
	readonly bytes: Bytes | null;
	readonly doc: JsonValue | null;
	readonly edits: readonly SaveEdit[];
	readonly loading: boolean;
	readonly status: string;
	readonly error: string;
	readonly building: boolean;
	readonly search: string;
	readonly tab: string | null;
	readonly working: JsonValue | null;
	readonly stagedPaths: ReadonlySet<string>;
	readonly summary: readonly SummaryRow[];
	readonly open: (fileName: string, source: Bytes) => Promise<void>;
	readonly onSelectFile: (file: File) => void;
	readonly stage: (edit: SaveEdit) => void;
	readonly stageMany: (planned: readonly SaveEdit[]) => void;
	readonly revert: (path: SaveEdit["path"]) => void;
	readonly clearEdits: () => void;
	readonly reset: () => void;
	readonly setSearch: (value: string) => void;
	readonly setTab: (value: string | null) => void;
	readonly rebuild: () => Promise<void>;
};

export const useSaveDocument = (codec: SaveCodec): SaveDocument => {
	const [name, setName] = useState<string | null>(null);
	const [bytes, setBytes] = useState<Bytes | null>(null);
	const [doc, setDoc] = useState<JsonValue | null>(null);
	const [edits, setEdits] = useState<readonly SaveEdit[]>([]);
	const [loading, setLoading] = useState(false);
	const [status, setStatus] = useState("");
	const [error, setError] = useState("");
	const [building, setBuilding] = useState(false);
	const [search, setSearch] = useState("");
	const [tab, setTab] = useState<string | null>("inspect");

	const open = useCallback(
		async (fileName: string, source: Bytes) => {
			setLoading(true);
			setError("");
			setStatus(`Reading ${fileName}`);
			try {
				// Yield once so the loading state paints before a multi-megabyte
				// parse starts; otherwise the tab freezes on the old screen and
				// the progress indicator is never seen.
				await new Promise((resolve) => setTimeout(resolve, 0));
				const decoded = await codec.decode(source);
				setName(fileName);
				setBytes(source);
				setDoc(decoded);
				setEdits([]);
				setSearch("");
			} catch (cause) {
				setError(
					cause instanceof Error
						? cause.message
						: "The file could not be read as this game's save.",
				);
			} finally {
				setLoading(false);
				setStatus("");
			}
		},
		[codec],
	);

	const onSelectFile = useCallback(
		(file: File) => {
			void readFileBytes(file).then((source) => open(file.name, source));
		},
		[open],
	);

	const stage = useCallback((edit: SaveEdit) => {
		setEdits((current) => stageEdits(current, [edit]));
	}, []);

	const stageMany = useCallback((planned: readonly SaveEdit[]) => {
		setEdits((current) => stageEdits(current, planned));
	}, []);

	const revert = useCallback((path: SaveEdit["path"]) => {
		setEdits((current) => withoutPath(current, path));
	}, []);

	const clearEdits = useCallback(() => setEdits([]), []);

	const reset = useCallback(() => {
		setName(null);
		setBytes(null);
		setDoc(null);
		setEdits([]);
		setError("");
		setSearch("");
	}, []);

	// Computed during render rather than stored: the working document is a
	// function of the loaded save and the staged edits, and keeping it derived
	// is what stops a render reading a document a previous render changed.
	const working = useMemo(
		() => (doc === null ? null : applyEdits(doc, edits)),
		[doc, edits],
	);

	const stagedPaths = useMemo(
		() => new Set(edits.map((edit) => formatPath(edit.path))),
		[edits],
	);

	const summary = useMemo(
		() => (doc === null ? [] : codec.summarise(doc)),
		[codec, doc],
	);

	const rebuild = useCallback(async () => {
		if (working === null || bytes === null || name === null) return;
		setBuilding(true);
		try {
			const verdict: RoundTripVerdict = await verifyRoundTrip(
				codec,
				bytes,
				working,
				edits.length > 0,
			);
			if (verdict.kind === "failed") {
				// A failed verification must not produce a file. Handing over
				// bytes that do not read back is precisely the outcome these
				// tools exist to prevent.
				notifications.show({
					color: "red",
					title: "Not handing this one over",
					message: verdict.reason,
				});
				return;
			}
			const rebuilt = await codec.encode(working);
			downloadBytes(rebuilt, rebuiltName(name));
			notifications.show({
				color: verdict.kind === "semantic" ? "yellow" : "teal",
				title: "Rebuilt save downloaded",
				message: describeVerdict(verdict),
			});
		} catch (cause) {
			notifications.show({
				color: "red",
				title: "Could not rebuild the save",
				message: cause instanceof Error ? cause.message : "Unexpected failure.",
			});
		} finally {
			setBuilding(false);
		}
	}, [bytes, codec, edits.length, name, working]);

	return {
		name,
		bytes,
		doc,
		edits,
		loading,
		status,
		error,
		building,
		search,
		tab,
		working,
		stagedPaths,
		summary,
		open,
		onSelectFile,
		stage,
		stageMany,
		revert,
		clearEdits,
		reset,
		setSearch,
		setTab,
		rebuild,
	};
};
