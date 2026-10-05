import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { Keyboard, Moon, Sun, Undo2 } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { EditorShell } from "@/components/editor-shell";
import {
	type InventoryFocus,
	InventoryView,
} from "@/components/inventory-view";
import { LandingView } from "@/components/landing-view";
import { SectionPanel, SkippedRecordsAlert } from "@/components/section-panel";
import { useEditorCatalogs } from "@/components/use-editor-catalogs";
import {
	useStagedEditGuards,
	useViewInUrl,
} from "@/components/use-editor-guards";
import { useStagedEdits } from "@/components/use-staged-edits";
import { useSaveSession } from "@/hooks/useSaveSession";
import {
	type CompanionCatalog,
	type CompanionCategory,
	companionLabels,
} from "@/lib/companions";
import { readDeepLink } from "@/lib/deep-link";
import companionCatalogData from "@/lib/generated/companion-catalog.json";
import {
	editorViewInfo,
	isEditorView,
	type SaveView,
	storageName,
} from "@/lib/inventory";
import { stagedCounts } from "@/lib/staged-counts";
import { queuedCompanions } from "@/lib/staged-edit-list";
import type { SaveEdit } from "@/lib/staged-edits";
import {
	itemTypeCount,
	projectRecords,
	storageSummaries,
} from "@/lib/staged-projection";
import {
	type Command,
	useCommandPalette,
	useShortcutsHelp,
} from "../../shared";
import { useThemeMode } from "../../shared/hooks/useThemeMode";

/**
 * The title and the line under it for whatever is on screen.
 *
 * The two are one decision — a view has a name and a description together, and
 * inventing the inventory's is what made this worth a function: an inventory
 * with no storage chosen says something different from one with a save open.
 */
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

/**
 * What the command palette offers.
 *
 * The view commands only exist once a save is open, because jumping to a panel
 * with nothing to show is not a shortcut to anything. Building the list here
 * keeps that rule in one place: it was previously decided twice over, by an
 * `if (result)` in the loop and by the `Home` component re-rendering whenever a
 * staged edit did.
 */
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

/**
 * The editor shell.
 *
 * It owns the three things the views genuinely share — the open session, the
 * staged edit list, and what the save parsed into — plus which view is on
 * screen. Everything else (the inventory's search, sort and selection, the
 * add-item drawer's destination and pick) lives in the view that uses it, so
 * an interaction re-renders that view rather than the whole page.
 */
export const Home = () => {
	const inputRef = useRef<HTMLInputElement>(null);
	// The shared site-wide theme, not Mantine's own scheme: this editor shares
	// its workbench with six others, and reading Mantine's key here meant a
	// visitor's choice made in any of them was not honoured here.
	const { dark, toggle } = useThemeMode();
	const deepLink = useMemo(readDeepLink, []);
	const [view, setView] = useState<SaveView>(deepLink.view);
	const [activeStorage, setActiveStorage] = useState<number | null>(
		deepLink.storage,
	);
	const [addOpen, setAddOpen] = useState(false);
	/** What a staged change just selected, so the inventory view follows it. */
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
	/** A file the user picked while staged edits still need confirmation. */
	const pendingFileRef = useRef<File | null>(null);
	const [reviewOpen, setReviewOpen] = useState(false);
	const [stagedMenuOpen, setStagedMenuOpen] = useState(false);
	const [navOpened, navHandlers] = useDisclosure(false);
	const isDesktop = useMediaQuery("(min-width: 48em)") ?? true;
	// The palette's own "Keyboard shortcuts" command opens this dialog; the
	// navbar's is mounted by `AppNav`, which keeps its instance to itself.
	const shortcuts = useShortcutsHelp();
	const palette = useCommandPalette();

	useStagedEditGuards({ stagedCount: edits.length, setEdits });
	useViewInUrl({ view, activeStorage });

	// Staged edits are folded into the records the views display, so a change
	// is visible before it is applied to the save. The folding is a pure
	// derivation, so it lives outside React, where the tests can hold it to the
	// appliers it previews.
	const displayRecords = useMemo(
		() =>
			result ? projectRecords(result.records, edits, equipmentCatalog) : [],
		[edits, equipmentCatalog, result],
	);

	const storages = useMemo(
		() => storageSummaries(displayRecords),
		[displayRecords],
	);

	// How many distinct items the open storage holds, for the header subtitle.
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

	/**
	 * Ask for confirmation before a file pick replaces staged work.
	 *
	 * `parseFile` clears the staged list and the open session as soon as it
	 * starts, so an unguarded pick would silently discard every staged change.
	 * The file is held until the user confirms; cancelling leaves the current
	 * save and its edits untouched.
	 */
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
