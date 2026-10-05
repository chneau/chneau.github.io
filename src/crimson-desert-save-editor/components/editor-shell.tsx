import { Box, Burger, Drawer, Flex } from "@mantine/core";
import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import { DownloadProgressBanner } from "@/components/download-progress-banner";
import { EditorHeaderActions } from "@/components/editor-header-actions";
import type { EquipmentCatalog } from "@/components/equipment-details";
import { SaveFileFooter } from "@/components/save-file-footer";
import { SaveFileInput } from "@/components/save-file-input";
import { SaveOverlays } from "@/components/save-overlays";
import type { EquipmentEdit, InsertEquipmentEdit } from "@/lib/equipment";
import type { Catalog, ParseResult, SaveView } from "@/lib/inventory";
import type { ItemKnowledgeMapFile } from "@/lib/save-engine/data";
import type { SaveEdit } from "@/lib/staged-edits";
import { AppNav, type Command, SkipLink } from "../../shared";

/** The progress the download banner shows while a save is rebuilt. */
type DownloadProgress = {
	completed: number;
	total: number;
	message: string;
};

/** The keys the editor itself binds, for the shared shortcuts dialog. */
const EDITOR_SHORTCUTS = [
	{
		title: "Editing",
		shortcuts: [
			{
				keys: ["Ctrl/⌘", "Z"],
				description: "Undo the last staged change",
			},
			{ keys: ["Esc"], description: "Close the open panel" },
		],
	},
];

/**
 * The editor's chrome: the navigation rail and its mobile drawer, the header
 * and its actions, the download banner, the footer, and the drawers, palette
 * and modals every view shares. The page composes it and hands it the open
 * session's state; the view bodies arrive as `children`.
 */
export const EditorShell = ({
	sidebar,
	children,
	isDesktop,
	navOpened,
	onCloseNav,
	onToggleNav,
	result,
	fileName,
	fileSize,
	pageTitle,
	pageSubtitle,
	dark,
	onToggleTheme,
	inputRef,
	onRequestFile,
	downloadProgress,
	elapsed,
	loading,
	view,
	activeStorage,
	catalog,
	equipmentCatalog,
	storages,
	edits,
	setEdits,
	removeStagedEdit,
	stageEquipment,
	setError,
	addOpen,
	setAddOpen,
	onDownload,
	stagedMenuOpen,
	setStagedMenuOpen,
	onReviewOpen,
	onDiscardOpen,
	nameOf,
	revealStaged,
	knowledgeMap,
	reviewOpen,
	onCloseReview,
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
	sidebar: ReactNode;
	children: ReactNode;
	isDesktop: boolean;
	navOpened: boolean;
	onCloseNav: () => void;
	onToggleNav: () => void;
	result: ParseResult | null;
	fileName: string;
	fileSize: number;
	pageTitle: string;
	pageSubtitle: string;
	dark: boolean;
	onToggleTheme: () => void;
	inputRef: RefObject<HTMLInputElement | null>;
	onRequestFile: (file: File) => void;
	downloadProgress: DownloadProgress | null;
	elapsed: number;
	loading: boolean;
	view: SaveView;
	activeStorage: number | null;
	catalog: Catalog | null;
	equipmentCatalog: EquipmentCatalog | null;
	storages: { key: number; records: number }[];
	edits: SaveEdit[];
	setEdits: Dispatch<SetStateAction<SaveEdit[]>>;
	removeStagedEdit: (index: number) => void;
	stageEquipment: (edit: EquipmentEdit | InsertEquipmentEdit) => void;
	setError: Dispatch<SetStateAction<string>>;
	addOpen: boolean;
	setAddOpen: Dispatch<SetStateAction<boolean>>;
	onDownload: () => void;
	stagedMenuOpen: boolean;
	setStagedMenuOpen: Dispatch<SetStateAction<boolean>>;
	onReviewOpen: () => void;
	onDiscardOpen: () => void;
	nameOf: (itemKey: number) => string;
	revealStaged: (target: {
		inventoryKey: number;
		itemKey: number;
		slotNo: number | null;
	}) => void;
	knowledgeMap: ItemKnowledgeMapFile | null;
	reviewOpen: boolean;
	onCloseReview: () => void;
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
	<Flex
		h="100dvh"
		w="100%"
		style={{
			overflow: "hidden",
			backgroundImage:
				"radial-gradient(circle at 82% -10%, rgba(157, 80, 98, 0.16), transparent 34rem)",
		}}
	>
		<SkipLink />
		{isDesktop && sidebar}
		<Drawer
			opened={!isDesktop && navOpened}
			onClose={onCloseNav}
			position="left"
			size={272}
			withCloseButton={false}
			padding={0}
			styles={{ body: { height: "100%" } }}
		>
			{sidebar}
		</Drawer>

		<Flex
			component="main"
			id="main"
			direction="column"
			style={{ flex: 1, minWidth: 0, minHeight: 0 }}
		>
			{result ? (
				// The visible brand is a span, so give each open save a real
				// level-one heading for the panels' h2s to sit under. It is
				// clipped, not removed, so assistive tech still announces it.
				<Box
					component="h1"
					style={{
						position: "absolute",
						width: 1,
						height: 1,
						overflow: "hidden",
						clip: "rect(0 0 0 0)",
						whiteSpace: "nowrap",
					}}
				>
					{pageTitle}
				</Box>
			) : null}
			<AppNav
				// This app binds the command palette, so the shared help dialog
				// may advertise it.
				hasCommandPalette
				staticPosition
				title={pageTitle}
				subtitle={pageSubtitle}
				brandHref={null}
				brandExtra={
					!isDesktop && (
						<Burger
							opened={navOpened}
							onClick={onToggleNav}
							size="sm"
							aria-label="Toggle navigation"
						/>
					)
				}
				theme={{
					dark,
					onToggle: onToggleTheme,
				}}
				shortcuts={EDITOR_SHORTCUTS}
				actions={
					<EditorHeaderActions
						result={result}
						fileName={fileName}
						fileSize={fileSize}
						catalog={catalog}
						equipmentCatalog={equipmentCatalog}
						storages={storages}
						activeStorage={activeStorage}
						edits={edits}
						setEdits={setEdits}
						stagedMenuOpen={stagedMenuOpen}
						setStagedMenuOpen={setStagedMenuOpen}
						view={view}
						loading={loading}
						inputRef={inputRef}
						setAddOpen={setAddOpen}
						stageEquipment={stageEquipment}
						onReviewOpen={onReviewOpen}
						onDiscardOpen={onDiscardOpen}
						onDownload={onDownload}
					/>
				}
			/>
			<SaveFileInput inputRef={inputRef} onRequestFile={onRequestFile} />

			{downloadProgress && (
				<DownloadProgressBanner
					message={downloadProgress.message}
					completed={downloadProgress.completed}
					total={downloadProgress.total}
					elapsed={elapsed}
				/>
			)}

			{children}

			{result && <SaveFileFooter result={result} />}
		</Flex>

		<SaveOverlays
			result={result}
			activeStorage={activeStorage}
			storages={storages}
			catalog={catalog}
			knowledgeMap={knowledgeMap}
			edits={edits}
			setEdits={setEdits}
			setError={setError}
			loading={loading}
			addOpen={addOpen}
			setAddOpen={setAddOpen}
			reviewOpen={reviewOpen}
			onCloseReview={onCloseReview}
			removeStagedEdit={removeStagedEdit}
			onDiscardOpen={onDiscardOpen}
			onDownload={onDownload}
			nameOf={nameOf}
			revealStaged={revealStaged}
			paletteOpened={paletteOpened}
			onClosePalette={onClosePalette}
			commands={commands}
			discardModalOpen={discardModalOpen}
			setDiscardModalOpen={setDiscardModalOpen}
			replaceModalOpen={replaceModalOpen}
			setReplaceModalOpen={setReplaceModalOpen}
			pendingFileRef={pendingFileRef}
			parseFile={parseFile}
		/>
	</Flex>
);
