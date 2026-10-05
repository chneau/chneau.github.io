import type { Dispatch, RefObject, SetStateAction } from "react";
import { AddItemDrawer } from "@/components/add-item-drawer";
import { ConfirmModal } from "@/components/confirm-modal";
import { StagedEditsDrawer } from "@/components/staged-edits-drawer";
import type { StagedTarget } from "@/components/use-staged-edits";
import type { Catalog, ParseResult } from "@/lib/inventory";
import type { ItemKnowledgeMapFile } from "@/lib/save-engine/data";
import type { SaveEdit } from "@/lib/staged-edits";
import { type Command, CommandPalette } from "../../shared";

/**
 * Everything that floats above the panels: the two drawers, the palette and
 * the confirmations.
 *
 * These are siblings in the shell's layout rather than part of the column, and
 * they share one thing — they all act on the staged list — which is why they
 * are gathered here. The shell keeps the header, the banner and the footer,
 * which are the parts a reader scrolls past.
 */
export const SaveOverlays = ({
	result,
	activeStorage,
	storages,
	catalog,
	knowledgeMap,
	edits,
	setEdits,
	setError,
	loading,
	addOpen,
	setAddOpen,
	reviewOpen,
	onCloseReview,
	removeStagedEdit,
	onDiscardOpen,
	onDownload,
	nameOf,
	revealStaged,
	paletteOpened,
	onClosePalette,
	commands,
	discardModalOpen,
	setDiscardModalOpen,
	replaceModalOpen,
	setReplaceModalOpen,
	pendingFileRef,
	parseFile,
}: {
	result: ParseResult | null;
	activeStorage: number | null;
	storages: { key: number; records: number }[];
	catalog: Catalog | null;
	knowledgeMap: ItemKnowledgeMapFile | null;
	edits: SaveEdit[];
	setEdits: Dispatch<SetStateAction<SaveEdit[]>>;
	setError: Dispatch<SetStateAction<string>>;
	loading: boolean;
	addOpen: boolean;
	setAddOpen: Dispatch<SetStateAction<boolean>>;
	reviewOpen: boolean;
	onCloseReview: () => void;
	removeStagedEdit: (index: number) => void;
	onDiscardOpen: () => void;
	onDownload: () => void;
	nameOf: (itemKey: number) => string;
	revealStaged: (target: StagedTarget) => void;
	paletteOpened: boolean;
	onClosePalette: () => void;
	commands: Command[];
	discardModalOpen: boolean;
	setDiscardModalOpen: Dispatch<SetStateAction<boolean>>;
	replaceModalOpen: boolean;
	setReplaceModalOpen: Dispatch<SetStateAction<boolean>>;
	/** The file a reader picked, held until the replace dialog is answered. */
	pendingFileRef: RefObject<File | null>;
	parseFile: (file: File) => Promise<void>;
}) => (
	<>
		<AddItemDrawer
			opened={addOpen}
			defaultStorage={activeStorage}
			storages={storages}
			records={result?.records ?? []}
			catalog={catalog}
			knowledgeMap={knowledgeMap}
			edits={edits}
			setEdits={setEdits}
			setError={setError}
			busy={loading}
			onClose={() => setAddOpen(false)}
			onReveal={revealStaged}
		/>

		<StagedEditsDrawer
			opened={reviewOpen}
			onClose={onCloseReview}
			edits={edits}
			nameOf={nameOf}
			onRemoveEdit={removeStagedEdit}
			onDiscardAll={onDiscardOpen}
			onDownload={onDownload}
			busy={loading}
		/>

		<CommandPalette
			opened={paletteOpened}
			onClose={onClosePalette}
			commands={commands}
		/>

		<ConfirmModal
			opened={discardModalOpen}
			title="Discard all changes?"
			body={`Are you sure you want to discard all ${edits.length} staged change${
				edits.length === 1 ? "" : "s"
			}? This action cannot be undone.`}
			confirmLabel="Discard all"
			dangerous
			onCancel={() => setDiscardModalOpen(false)}
			onConfirm={() => {
				setEdits([]);
				setDiscardModalOpen(false);
			}}
		/>

		<ConfirmModal
			opened={replaceModalOpen}
			title="Open another save?"
			// The pending file is cleared on every way out of this dialog, so
			// cancelling cannot leave a picked file armed to be opened by the next
			// press of "Open save".
			body={`Opening a save replaces the current one and discards all ${
				edits.length
			} staged change${edits.length === 1 ? "" : "s"}. Download the rebuilt save first if you want to keep them.`}
			confirmLabel="Discard and open"
			cancelLabel="Cancel"
			dangerous
			onCancel={() => {
				pendingFileRef.current = null;
				setReplaceModalOpen(false);
			}}
			onConfirm={() => {
				const file = pendingFileRef.current;
				pendingFileRef.current = null;
				setReplaceModalOpen(false);
				if (file) void parseFile(file);
			}}
		/>
	</>
);
