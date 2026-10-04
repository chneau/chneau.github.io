import { notifications } from "@mantine/notifications";
import {
	type Dispatch,
	type SetStateAction,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { InventoryFocus } from "@/components/inventory-view";
import type { ParseResult, SaveView } from "@/lib/inventory";
import { describeError } from "@/lib/save-engine/errors";
import { type SaveEngineEvent, SaveSession } from "@/lib/save-engine/session";
import type { SaveEdit } from "@/lib/staged-edits";

/**
 * The page-owned state `useSaveSession` must touch when it clears the deck for
 * a newly opened save. Each is a `useState` setter, so it is stable and the
 * callbacks below keep a steady identity.
 */
type SaveSessionCoordination = {
	setView: Dispatch<SetStateAction<SaveView>>;
	setActiveStorage: Dispatch<SetStateAction<number | null>>;
	setFocus: Dispatch<SetStateAction<InventoryFocus | null>>;
	setAddOpen: Dispatch<SetStateAction<boolean>>;
	setEdits: Dispatch<SetStateAction<SaveEdit[]>>;
};

type UseSaveSessionOptions = SaveSessionCoordination & {
	/** The view a save opened from a deep link should land on. */
	initialView: SaveView;
	/** The storage the deep link asked for, taken by the first parse. */
	initialStorage: number | null;
	/** The staged edits, read when a download is requested. */
	edits: SaveEdit[];
};

/**
 * The open save session: the engine, the file it read, what it parsed into and
 * the progress a rebuild reports.
 *
 * The engine stays on the main thread (ADR-0001) and every byte stays in the
 * page (ADR-0003); this hook is only the React seam over `SaveSession`'s event
 * stream, so the page does not own progress state, the parsed result or the
 * parse/download callbacks itself.
 */
export const useSaveSession = ({
	initialView,
	initialStorage,
	edits,
	setView,
	setActiveStorage,
	setFocus,
	setAddOpen,
	setEdits,
}: UseSaveSessionOptions) => {
	const session = useMemo(() => new SaveSession(), []);
	const currentFileNameRef = useRef("save.save");
	const pendingViewRef = useRef<SaveView>(initialView);
	const pendingStorageRef = useRef<number | null>(initialStorage);
	const [fileName, setFileName] = useState("");
	const [fileSize, setFileSize] = useState(0);
	const [result, setResult] = useState<ParseResult | null>(null);
	const [status, setStatus] = useState("");
	const [downloadProgress, setDownloadProgress] = useState<{
		completed: number;
		total: number;
		message: string;
	} | null>(null);
	const [elapsed, setElapsed] = useState(0);
	const downloading = downloadProgress !== null;
	useEffect(() => {
		if (!downloading) return;
		const start = Date.now();
		const timer = window.setInterval(
			() => setElapsed(Math.floor((Date.now() - start) / 1000)),
			1000,
		);
		return () => window.clearInterval(timer);
	}, [downloading]);
	const [error, setError] = useState("");

	useEffect(() => {
		return () => session.reset();
	}, [session]);

	const handleEngineEvent = useCallback(
		(event: SaveEngineEvent) => {
			if (event.type === "progress") {
				setDownloadProgress({
					completed: event.completed,
					total: event.total,
					message: event.message,
				});
			}
			if (event.type === "status") setStatus(event.message);
			if (event.type === "error") {
				setStatus("");
				setDownloadProgress(null);
				setError(event.message || "The save could not be read.");
			}
			if (event.type === "result") {
				const parsed = event.payload as ParseResult;
				const keys = [
					...new Set(parsed.records.map((record) => record.inventoryKey)),
				].sort((a, b) => a - b);
				const pending = pendingStorageRef.current;
				pendingStorageRef.current = null;
				setResult(parsed);
				setActiveStorage(
					pending !== null && keys.includes(pending)
						? pending
						: keys.includes(2)
							? 2
							: (keys[0] ?? null),
				);
				setStatus("");
				setDownloadProgress(null);
			}
			if (event.type === "edited") {
				const blob = new Blob([event.buffer], {
					type: "application/octet-stream",
				});
				const url = URL.createObjectURL(blob);
				const link = document.createElement("a");
				link.href = url;
				link.download = `${currentFileNameRef.current.replace(
					/\.save$/i,
					"",
				)}-edited.save`;
				link.click();
				window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
				setStatus("");
				setDownloadProgress(null);
				notifications.show({
					message: "Rebuilt save downloaded",
					color: "teal",
				});
			}
		},
		[setActiveStorage],
	);

	const parseFile = useCallback(
		async (file: File) => {
			if (file.name.toLowerCase() === "lobby.save") {
				setError(
					"Open save.save instead. lobby.save contains the slot summary and does not need editing.",
				);
				return;
			}
			if (!file.name.toLowerCase().endsWith(".save")) {
				setError("Choose a Crimson Desert .save file.");
				return;
			}
			session.reset();
			currentFileNameRef.current = file.name;
			setFileName(file.name);
			setFileSize(file.size);
			setResult(null);
			setView(pendingViewRef.current);
			pendingViewRef.current = "inventory";
			setActiveStorage(null);
			setFocus(null);
			setAddOpen(false);
			setEdits([]);
			setError("");
			setStatus("Reading file locally…");

			let buffer: ArrayBuffer;
			try {
				buffer = await file.arrayBuffer();
			} catch (readError) {
				setStatus("");
				setError(
					`The selected file could not be read: ${describeError(readError)}`,
				);
				return;
			}
			void session.parse(buffer, handleEngineEvent);
		},
		[
			handleEngineEvent,
			session,
			setActiveStorage,
			setAddOpen,
			setEdits,
			setFocus,
			setView,
		],
	);

	const downloadEditedSave = () => {
		if (edits.length === 0 || status) return;
		setElapsed(0);
		setDownloadProgress({
			completed: 0,
			total: 1,
			message: "Starting save preparation",
		});
		setError("");
		setStatus("Validating edits and rebuilding save…");
		void session.apply(edits, handleEngineEvent);
	};

	const loading = Boolean(status);

	return {
		session,
		fileName,
		fileSize,
		result,
		status,
		error,
		setError,
		downloadProgress,
		elapsed,
		loading,
		parseFile,
		downloadEditedSave,
	};
};
