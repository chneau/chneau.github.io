import type { Dispatch, RefObject, SetStateAction } from "react";
import { type Command, CommandPalette } from "../../shared";
import { ConfirmDialog } from "../../shared/save/components/ConfirmDialog";
import type { Catalog, ParseResult } from "../lib/inventory";
import type { ItemKnowledgeMapFile } from "../lib/save-engine/data";
import type { SaveEdit } from "../lib/staged-edits";
import { AddItemDrawer } from "./add-item-drawer";
import { StagedEditsDrawer } from "./staged-edits-drawer";
import type { StagedTarget } from "./use-staged-edits";

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

		<ConfirmDialog
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

		<ConfirmDialog
			opened={replaceModalOpen}
			title="Open another save?"
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
