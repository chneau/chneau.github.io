import { notifications } from "@mantine/notifications";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Bytes } from "./bytes";
import { applyEditsSafely, pathKey, stageEdits, withoutPath } from "./edits";
import { downloadBytes, readFileBytes, rebuiltName } from "./file";
import { formatPath, type JsonValue } from "./json";
import { yieldToBrowser } from "./macrotask";
import {
	describeVerdict,
	type RoundTripVerdict,
	verifyRoundTrip,
} from "./roundtrip";
import type { SaveCodec, SaveEdit, SummaryRow } from "./types";

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

	useEffect(() => {
		if (edits.length === 0) return;
		const warn = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = "";
		};
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [edits.length]);

	const open = useCallback(
		async (fileName: string, source: Bytes) => {
			setLoading(true);
			setError("");
			setStatus(`Reading ${fileName}`);
			try {
				await yieldToBrowser();
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
			void readFileBytes(file)
				.then((source) => open(file.name, source))
				.catch((cause) => {
					setError(
						cause instanceof Error
							? cause.message
							: "The file could not be read as this game's save.",
					);
				});
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

	const { doc: working, failed: unapplicable } = useMemo(
		() =>
			doc === null ? { doc: null, failed: [] } : applyEditsSafely(doc, edits),
		[doc, edits],
	);

	const warnedRef = useRef<string>("");
	useEffect(() => {
		const names = unapplicable.map((edit) => formatPath(edit.path)).join(", ");
		if (names === warnedRef.current) return;
		warnedRef.current = names;
		if (names === "") return;
		notifications.show({
			color: "red",
			title: "One change could not be applied",
			message: `This save does not carry ${names}, so that change was left out. Revert it in the staged list, or open a save from a version that has it.`,
		});
	}, [unapplicable]);

	const stagedPaths = useMemo(
		() => new Set(edits.map((edit) => pathKey(edit.path))),
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
