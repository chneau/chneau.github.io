import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { Keyboard, Moon, Sun, Undo2 } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import {
	type Command,
	useCommandPalette,
	useShortcutsHelp,
} from "../../shared";
import { useThemeMode } from "../../shared/hooks/useThemeMode";
import { AppSidebar } from "../components/app-sidebar";
import { EditorShell } from "../components/editor-shell";
import {
	type InventoryFocus,
	InventoryView,
} from "../components/inventory-view";
import { LandingView } from "../components/landing-view";
import { SectionPanel, SkippedRecordsAlert } from "../components/section-panel";
import { useEditorCatalogs } from "../components/use-editor-catalogs";
import {
	useStagedEditGuards,
	useViewInUrl,
} from "../components/use-editor-guards";
import { useStagedEdits } from "../components/use-staged-edits";
import { useSaveSession } from "../hooks/useSaveSession";
import {
	type CompanionCatalog,
	type CompanionCategory,
	companionLabels,
} from "../lib/companions";
import { readDeepLink } from "../lib/deep-link";
import companionCatalogData from "../lib/generated/companion-catalog.json";
import {
	editorViewInfo,
	isEditorView,
	type SaveView,
	storageName,
} from "../lib/inventory";
import { stagedCounts } from "../lib/staged-counts";
import { queuedCompanions } from "../lib/staged-edit-list";
import type { SaveEdit } from "../lib/staged-edits";
import {
	itemTypeCount,
	projectRecords,
	storageSummaries,
} from "../lib/staged-projection";

const headingFor = ({
	view,
	hasSave,
	activeStorage,
	itemTypes,
}: {
	view: SaveView;
	hasSave: boolean;
	activeStorage: number | null;
	itemTypes: number;
}): { title: string; subtitle: string } => {
	if (view === "inventory") {
		return {
			title:
				hasSave && activeStorage !== null
					? storageName(activeStorage)
					: "Save Editor",
			subtitle: hasSave
				? `${itemTypes} item types in this location`
				: "Load a save, make changes and download the edited file",
		};
	}
	if (isEditorView(view)) {
		return {
			title: editorViewInfo[view].label,
			subtitle: editorViewInfo[view].blurb,
		};
	}
	return {
		title: companionLabels[view],
		subtitle: "Pets, horses, special mounts and camp mercenaries",
	};
};

const buildCommands = ({
	dark,
	toggleTheme,
	openShortcuts,
	undoLast,
	stagedCount,
	loaded,
	goToView,
}: {
	dark: boolean;
	toggleTheme: () => void;
	openShortcuts: () => void;
	undoLast: () => void;
	stagedCount: number;
	loaded: boolean;
	goToView: (view: SaveView) => void;
}): Command[] => {
	const list: Command[] = [
		{
			id: "toggle-theme",
			label: "Toggle light / dark theme",
			keywords: "theme dark light mode appearance",
			icon: dark ? <Sun size={16} /> : <Moon size={16} />,
			run: toggleTheme,
		},
		{
			id: "keyboard-shortcuts",
			label: "Keyboard shortcuts",
			keywords: "shortcuts keyboard keys help",
			icon: <Keyboard size={16} />,
			run: openShortcuts,
		},
	];
	if (stagedCount > 0) {
		list.push({
			id: "undo-last-change",
			label: "Undo last change",
			hint: `${stagedCount} staged`,
			keywords: "undo revert staged change",
			icon: <Undo2 size={16} />,
			run: undoLast,
		});
	}
	if (loaded) {
		const views: SaveView[] = [
			"inventory",
			...(Object.keys(editorViewInfo) as (keyof typeof editorViewInfo)[]),
			...(Object.keys(companionLabels) as CompanionCategory[]),
		];
		for (const id of views) {
			const label =
				id === "inventory"
					? "Inventory"
					: isEditorView(id)
						? editorViewInfo[id].label
						: companionLabels[id];
			list.push({
				id: `view-${id}`,
				label: `Go to ${label}`,
				hint: "View",
				keywords: `view section ${id}`,
				run: () => goToView(id),
			});
		}
	}
	return list;
};

export const Home = () => {
	const inputRef = useRef<HTMLInputElement>(null);
	const { dark, toggle } = useThemeMode();
	const deepLink = useMemo(readDeepLink, []);
	const [view, setView] = useState<SaveView>(deepLink.view);
	const [activeStorage, setActiveStorage] = useState<number | null>(
		deepLink.storage,
	);
	const [addOpen, setAddOpen] = useState(false);
	const [focus, setFocus] = useState<InventoryFocus | null>(null);
	const [edits, setEdits] = useState<SaveEdit[]>([]);
	const {
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
	} = useSaveSession({
		initialView: deepLink.view,
		initialStorage: deepLink.storage,
		edits,
		setView,
		setActiveStorage,
		setFocus,
		setAddOpen,
		setEdits,
	});
	const { catalog, equipmentCatalog, knowledgeMap } = useEditorCatalogs();
	const companionCatalog = companionCatalogData as CompanionCatalog;
	const [discardModalOpen, setDiscardModalOpen] = useState(false);
	const [replaceModalOpen, setReplaceModalOpen] = useState(false);
	const pendingFileRef = useRef<File | null>(null);
	const [reviewOpen, setReviewOpen] = useState(false);
	const [stagedMenuOpen, setStagedMenuOpen] = useState(false);
	const [navOpened, navHandlers] = useDisclosure(false);
	const isDesktop = useMediaQuery("(min-width: 48em)") ?? true;
	const shortcuts = useShortcutsHelp();
	const palette = useCommandPalette();

	useStagedEditGuards({ stagedCount: edits.length, setEdits });
	useViewInUrl({ view, activeStorage });

	const displayRecords = useMemo(
		() =>
			result ? projectRecords(result.records, edits, equipmentCatalog) : [],
		[edits, equipmentCatalog, result],
	);

	const storages = useMemo(
		() => storageSummaries(displayRecords),
		[displayRecords],
	);

	const itemTypes = useMemo(
		() => itemTypeCount(displayRecords, activeStorage),
		[activeStorage, displayRecords],
	);

	const nameOf = useCallback(
		(itemKey: number) =>
			catalog?.items[String(itemKey)]?.name ?? `Unknown item ${itemKey}`,
		[catalog],
	);

	const companionEdits = queuedCompanions(edits);

	const {
		revealStaged,
		stageEquipment,
		stageCompanion,
		stageDyes,
		stageConditions,
		stageLevels,
		stageQuests,
		stageNames,
		stageSkill,
		removeStagedEdit,
	} = useStagedEdits({
		setEdits,
		setError,
		busy: Boolean(status),
		result,
		companionCatalog,
		setActiveStorage,
		setFocus,
	});

	const requestParseFile = useCallback(
		(file: File) => {
			if (edits.length === 0) {
				void parseFile(file);
				return;
			}
			pendingFileRef.current = file;
			setReplaceModalOpen(true);
		},
		[edits.length, parseFile],
	);

	const { stagedStorageCounts, stagedViewCounts } = useMemo(
		() => stagedCounts(edits),
		[edits],
	);

	const commands = useMemo(
		() =>
			buildCommands({
				dark,
				toggleTheme: toggle,
				openShortcuts: () => shortcuts.open(),
				undoLast: () => setEdits((current) => current.slice(0, -1)),
				stagedCount: edits.length,
				loaded: Boolean(result),
				goToView: (next) => {
					setView(next);
					setAddOpen(false);
				},
			}),
		[dark, toggle, shortcuts.open, edits.length, result],
	);

	const { title: pageTitle, subtitle: pageSubtitle } = headingFor({
		view,
		hasSave: Boolean(result),
		activeStorage,
		itemTypes,
	});

	const sidebar = (
		<AppSidebar
			result={result}
			fileName={fileName}
			fileSize={fileSize}
			storages={storages}
			view={view}
			activeStorage={activeStorage}
			stagedStorageCounts={stagedStorageCounts}
			stagedViewCounts={stagedViewCounts}
			onSelectStorage={(key) => {
				setView("inventory");
				setActiveStorage(key);
				setFocus(null);
			}}
			onSelectView={(next) => {
				setView(next);
				setAddOpen(false);
			}}
			onNavigate={navHandlers.close}
		/>
	);

	const content = !result ? (
		<LandingView
			loading={loading}
			status={status}
			error={error}
			onOpenFile={() => inputRef.current?.click()}
			onSelectFile={(file) => requestParseFile(file)}
		/>
	) : (
		<>
			{result.skippedRecords > 0 && (
				<SkippedRecordsAlert
					count={result.skippedRecords}
					details={result.skippedDetails}
				/>
			)}
			<SectionPanel
				view={view}
				result={result}
				session={session}
				edits={edits}
				companionEdits={companionEdits}
				companionCatalog={companionCatalog}
				busy={loading}
				error={error}
				nameOf={nameOf}
				onStageSkill={stageSkill}
				onDiscardSkill={() =>
					setEdits((current) =>
						current.filter((entry) => entry.type !== "skills"),
					)
				}
				onStageCompanion={stageCompanion}
				onDiscardCompanion={(edit) =>
					setEdits((current) => current.filter((e) => e !== edit))
				}
				onStageLevels={stageLevels}
				onStageQuests={stageQuests}
				onStageDyes={stageDyes}
				onStageConditions={stageConditions}
				onStageNames={stageNames}
			/>
			<InventoryView
				records={displayRecords}
				savedRecords={result.records}
				activeStorage={activeStorage}
				catalog={catalog}
				equipmentCatalog={equipmentCatalog}
				edits={edits}
				setEdits={setEdits}
				error={error}
				setError={setError}
				busy={loading}
				focus={focus}
				hidden={view !== "inventory"}
				onStageEquipment={stageEquipment}
			/>
		</>
	);

	return (
		<EditorShell
			sidebar={sidebar}
			isDesktop={isDesktop}
			navOpened={navOpened}
			onCloseNav={navHandlers.close}
			onToggleNav={navHandlers.toggle}
			result={result}
			fileName={fileName}
			fileSize={fileSize}
			pageTitle={pageTitle}
			pageSubtitle={pageSubtitle}
			dark={dark}
			onToggleTheme={toggle}
			inputRef={inputRef}
			onRequestFile={requestParseFile}
			downloadProgress={downloadProgress}
			elapsed={elapsed}
			loading={loading}
			view={view}
			activeStorage={activeStorage}
			catalog={catalog}
			equipmentCatalog={equipmentCatalog}
			storages={storages}
			edits={edits}
			setEdits={setEdits}
			removeStagedEdit={removeStagedEdit}
			stageEquipment={stageEquipment}
			setError={setError}
			addOpen={addOpen}
			setAddOpen={setAddOpen}
			onDownload={downloadEditedSave}
			stagedMenuOpen={stagedMenuOpen}
			setStagedMenuOpen={setStagedMenuOpen}
			onReviewOpen={() => setReviewOpen(true)}
			onDiscardOpen={() => setDiscardModalOpen(true)}
			nameOf={nameOf}
			revealStaged={revealStaged}
			knowledgeMap={knowledgeMap}
			reviewOpen={reviewOpen}
			onCloseReview={() => setReviewOpen(false)}
			paletteOpened={palette.opened}
			onClosePalette={palette.close}
			commands={commands}
			discardModalOpen={discardModalOpen}
			setDiscardModalOpen={setDiscardModalOpen}
			replaceModalOpen={replaceModalOpen}
			setReplaceModalOpen={setReplaceModalOpen}
			pendingFileRef={pendingFileRef}
			parseFile={parseFile}
		>
			{content}
		</EditorShell>
	);
};
