import {
	Badge,
	Box,
	Burger,
	Button,
	Drawer,
	Flex,
	Group,
	Loader,
	Menu,
	Modal,
	Progress,
	Stack,
	Text,
} from "@mantine/core";
import {
	CheckCircle2,
	Download,
	FileUp,
	HardDrive,
	LockKeyhole,
	Plus,
	Trash2,
	Undo2,
} from "lucide-react";
import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import { AddItemDrawer } from "@/components/add-item-drawer";
import { EquipmentCatalogPanel } from "@/components/equipment-catalog-panel";
import type { EquipmentCatalog } from "@/components/equipment-workshop";
import { StagedEditsDrawer } from "@/components/staged-edits-drawer";
import type { EquipmentEdit, InsertEquipmentEdit } from "@/lib/equipment";
import {
	type Catalog,
	type ParseResult,
	type SaveView,
	storageName,
} from "@/lib/inventory";
import type { ItemKnowledgeMapFile } from "@/lib/save-engine/data";
import type { SaveEdit } from "@/lib/staged-edits";
import {
	AppNav,
	type Command,
	CommandPalette,
	HeaderAction,
	SkipLink,
} from "../../shared";

/** The progress the download banner shows while a save is rebuilt. */
type DownloadProgress = {
	completed: number;
	total: number;
	message: string;
};

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
				shortcuts={[
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
				]}
				actions={
					<>
						{result && (
							<>
								{fileName && (
									<Badge
										variant="default"
										visibleFrom="md"
										h={28}
										color="gray"
										leftSection={<HardDrive size={13} strokeWidth={2} />}
										title={`${fileName} (${(fileSize / 1024).toFixed(1)} KB)`}
									>
										{fileName}
									</Badge>
								)}
								<Badge variant="outline" color="brand" visibleFrom="lg" h={28}>
									Build {catalog?.game.steam_build_id ?? "catalog loading"}
								</Badge>
							</>
						)}
						<HeaderAction
							label={result ? "Open another save" : "Open save"}
							icon={<FileUp size={16} />}
							onClick={() => inputRef.current?.click()}
						>
							{result ? "Open another" : "Open save"}
						</HeaderAction>

						{result && (
							<>
								{edits.length > 0 && (
									<Menu
										position="bottom-end"
										withinPortal
										opened={stagedMenuOpen}
										onChange={setStagedMenuOpen}
									>
										<Menu.Target>
											<HeaderAction
												label={`Staged changes (${edits.length})`}
												icon={<CheckCircle2 size={16} />}
												ariaExpanded={stagedMenuOpen}
												ariaHaspopup="menu"
											>
												Staged ({edits.length})
											</HeaderAction>
										</Menu.Target>
										<Menu.Dropdown>
											<Menu.Item
												leftSection={<CheckCircle2 size={15} />}
												onClick={onReviewOpen}
											>
												Review staged changes
											</Menu.Item>
											<Menu.Item
												leftSection={<Undo2 size={15} />}
												onClick={() =>
													setEdits((current) => current.slice(0, -1))
												}
											>
												Undo last change
											</Menu.Item>
											<Menu.Divider />
											<Menu.Item
												color="red"
												leftSection={<Trash2 size={15} />}
												onClick={onDiscardOpen}
											>
												Discard all
											</Menu.Item>
										</Menu.Dropdown>
									</Menu>
								)}
								{view === "inventory" && (
									<>
										<EquipmentCatalogPanel
											catalog={equipmentCatalog}
											itemCatalog={catalog}
											storages={storages.map((entry) => ({
												key: entry.key,
												name: storageName(entry.key),
											}))}
											defaultStorage={activeStorage}
											records={result.records}
											edits={edits}
											busy={loading}
											onStage={stageEquipment}
										/>
										<HeaderAction
											label="Add item"
											icon={<Plus size={16} />}
											onClick={() => setAddOpen(true)}
										>
											Add item
										</HeaderAction>
									</>
								)}
								<HeaderAction
									accent
									disabled={edits.length === 0}
									loading={loading}
									label="Download save"
									icon={loading ? <Loader size={16} /> : <Download size={16} />}
									onClick={onDownload}
								>
									Download save
									{edits.length > 0 ? ` (${edits.length})` : ""}
								</HeaderAction>
							</>
						)}
					</>
				}
			/>
			<input
				ref={inputRef}
				type="file"
				accept=".save"
				aria-label="Open a Crimson Desert save file"
				style={{
					position: "absolute",
					width: 1,
					height: 1,
					overflow: "hidden",
					clip: "rect(0 0 0 0)",
					whiteSpace: "nowrap",
				}}
				onChange={(event) => {
					const file = event.target.files?.[0];
					// Clear the input so choosing the same file again still fires.
					event.target.value = "";
					if (file) onRequestFile(file);
				}}
			/>

			{downloadProgress && (
				<Box
					px="md"
					py="md"
					role="status"
					aria-live="polite"
					aria-busy="true"
					style={{
						flexShrink: 0,
						borderBottom: "1px solid var(--mantine-primary-color-filled)",
						background: "var(--mantine-primary-color-light)",
					}}
				>
					<Group justify="space-between" gap="md" mb="xs">
						<Group gap="xs">
							<Loader size={16} />
							<Text size="sm">{downloadProgress.message}…</Text>
						</Group>
						<Text size="sm">
							{downloadProgress.completed} / {downloadProgress.total} steps
						</Text>
					</Group>
					<Progress
						value={(downloadProgress.completed / downloadProgress.total) * 100}
						aria-label="Save preparation progress"
					/>
					<Text mt="xs" size="xs" c="dimmed">
						{elapsed}s elapsed. Large saves can take several minutes; keep this
						tab open.
					</Text>
				</Box>
			)}

			{children}

			{result && (
				<Group
					h={36}
					px="md"
					justify="space-between"
					wrap="nowrap"
					style={{
						flexShrink: 0,
						borderTop: "1px solid var(--app-border)",
					}}
				>
					<Group gap={6} wrap="nowrap">
						<LockKeyhole
							size={12}
							color="var(--app-text-muted)"
							strokeWidth={2}
						/>
						<Text size="xs" c="dimmed">
							Original file untouched
						</Text>
					</Group>
					<Text size="xs" c="dimmed" ff="monospace">
						{result.records.length} records
					</Text>
				</Group>
			)}
		</Flex>

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

		<Modal
			opened={discardModalOpen}
			onClose={() => setDiscardModalOpen(false)}
			title="Discard all changes?"
			centered
			size="sm"
		>
			<Stack gap="md">
				<Text size="sm">
					Are you sure you want to discard all {edits.length} staged change
					{edits.length === 1 ? "" : "s"}? This action cannot be undone.
				</Text>
				<Group justify="flex-end" gap="sm">
					<Button variant="default" onClick={() => setDiscardModalOpen(false)}>
						Cancel
					</Button>
					<Button
						color="red"
						onClick={() => {
							setEdits([]);
							setDiscardModalOpen(false);
						}}
					>
						Discard all
					</Button>
				</Group>
			</Stack>
		</Modal>

		<Modal
			opened={replaceModalOpen}
			onClose={() => {
				pendingFileRef.current = null;
				setReplaceModalOpen(false);
			}}
			title="Open another save?"
			centered
			size="sm"
		>
			<Stack gap="md">
				<Text size="sm">
					Opening a save replaces the current one and discards all{" "}
					{edits.length} staged change{edits.length === 1 ? "" : "s"}. Download
					the rebuilt save first if you want to keep them.
				</Text>
				<Group justify="flex-end" gap="sm">
					<Button
						variant="default"
						onClick={() => {
							pendingFileRef.current = null;
							setReplaceModalOpen(false);
						}}
					>
						Cancel
					</Button>
					<Button
						color="red"
						onClick={() => {
							const file = pendingFileRef.current;
							pendingFileRef.current = null;
							setReplaceModalOpen(false);
							if (file) void parseFile(file);
						}}
					>
						Discard and open
					</Button>
				</Group>
			</Stack>
		</Modal>
	</Flex>
);
