import { Alert, useMantineColorScheme } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { Keyboard, Moon, Sun, TriangleAlert, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { CompanionPanel } from "@/components/companion-panel";
import { ConditionPanel } from "@/components/condition-panel";
import { DyesPanel } from "@/components/dyes-panel";
import { EditorShell } from "@/components/editor-shell";
import type { EquipmentCatalog } from "@/components/equipment-workshop";
import {
	type InventoryFocus,
	InventoryView,
} from "@/components/inventory-view";
import { LandingView } from "@/components/landing-view";
import { LevelsPanel } from "@/components/levels-panel";
import { NamesPanel } from "@/components/names-panel";
import { QuestsPanel } from "@/components/quests-panel";
import { SkillsPanel } from "@/components/skills-panel";
import { useSaveSession } from "@/hooks/useSaveSession";
import {
	type CompanionCatalog,
	type CompanionCategory,
	type CompanionEdit,
	companionLabels,
} from "@/lib/companions";
import { readDeepLink } from "@/lib/deep-link";
import type { EquipmentEdit, InsertEquipmentEdit } from "@/lib/equipment";
import companionCatalogData from "@/lib/generated/companion-catalog.json";
import {
	type Catalog,
	type CatalogItem,
	editorViewInfo,
	isEditorView,
	type SaveView,
	storageName,
} from "@/lib/inventory";
import {
	equipmentCatalogTable,
	type ItemCatalogFile,
	type ItemKnowledgeMapFile,
	itemCatalogTable,
	itemKnowledgeTable,
} from "@/lib/save-engine/data";
import type { SkillEdit } from "@/lib/skills";
import { stagedCounts } from "@/lib/staged-counts";
import * as stagedList from "@/lib/staged-edit-list";
import type {
	CompanionRenameEdit,
	DyeEdit,
	ItemConditionEdit,
	LevelEdit,
	QuestStateEdit,
	SaveEdit,
} from "@/lib/staged-edits";
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
	const { colorScheme, setColorScheme } = useMantineColorScheme();
	const dark = colorScheme === "dark";
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
	const [baseCatalog, setCatalog] = useState<ItemCatalogFile | null>(null);
	const [equipmentCatalog, setEquipmentCatalog] =
		useState<EquipmentCatalog | null>(null);
	const companionCatalog = companionCatalogData as CompanionCatalog;
	const catalog = useMemo<Catalog | null>(() => {
		if (!baseCatalog) return null;
		const items: Record<string, CatalogItem> = { ...baseCatalog.items };
		for (const [key, equipment] of Object.entries(
			equipmentCatalog?.items ?? {},
		)) {
			items[key] = {
				...items[key],
				name: equipment.name,
				legacy_internal_name_hint: equipment.internalName,
				max_stack: 1,
				legacy_max_stack_hint: 1,
				equipmentCategory: equipment.category,
				addsAsSingleRecord: !equipment.characterEquipment,
			};
		}
		return { ...baseCatalog, items };
	}, [baseCatalog, equipmentCatalog]);
	const [knowledgeMap, setKnowledgeMap] = useState<ItemKnowledgeMapFile | null>(
		null,
	);
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

	const removeStagedEdit = (index: number) => {
		setEdits((current) => current.filter((_, i) => i !== index));
	};

	// Global shortcut: Ctrl+Z / Cmd+Z to undo the latest staged edit
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (
				(e.ctrlKey || e.metaKey) &&
				e.key.toLowerCase() === "z" &&
				!e.shiftKey
			) {
				const activeTag = document.activeElement?.tagName?.toLowerCase();
				if (activeTag === "input" || activeTag === "textarea") return;
				if (edits.length === 0) return;
				e.preventDefault();
				setEdits((current) => current.slice(0, -1));
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [edits.length]);

	// Staged edits only exist in this tab's memory: a reload or a closed tab
	// loses them with no download. The browser's own confirmation is the only
	// guard for those paths, so raise it whenever work is pending.
	useEffect(() => {
		if (edits.length === 0) return;
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			// Legacy browsers need a truthy returnValue for the prompt to show.
			event.returnValue = "";
		};
		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, [edits.length]);

	// Keep the active view (and, in the inventory, the selected storage) in the
	// URL so a section can be linked to. Only these stable ids are written;
	// save content, file names and other data never reach the URL.
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		params.set("view", view);
		if (view === "inventory" && activeStorage !== null) {
			params.set("storage", String(activeStorage));
		} else {
			params.delete("storage");
		}
		const query = params.toString();
		const url = `${window.location.pathname}${
			query ? `?${query}` : ""
		}${window.location.hash}`;
		window.history.replaceState(null, "", url);
	}, [view, activeStorage]);

	useEffect(() => {
		void itemCatalogTable()
			.then((table) => setCatalog(table))
			.catch(() => setCatalog(null));
		void itemKnowledgeTable()
			.then((table) => setKnowledgeMap(table))
			.catch(() => setKnowledgeMap(null));
		void equipmentCatalogTable()
			.then((table) => setEquipmentCatalog(table))
			.catch(() => setEquipmentCatalog(null));
	}, []);

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

	const revealStaged = useCallback(
		(target: {
			inventoryKey: number;
			itemKey: number;
			slotNo: number | null;
		}) => {
			setActiveStorage(target.inventoryKey);
			setFocus({ itemKey: target.itemKey, slotNo: target.slotNo });
		},
		[],
	);

	const stageEquipment = useCallback(
		(edit: EquipmentEdit | InsertEquipmentEdit) => {
			setError("");
			setEdits((current) => stagedList.stageEquipment(current, edit));
			revealStaged({
				inventoryKey: edit.inventoryKey,
				itemKey: edit.itemKey,
				slotNo: edit.type === "equipment" ? edit.slotNo : null,
			});
		},
		[revealStaged],
	);

	const companionEdits = stagedList.queuedCompanions(edits);
	const stageCompanion = (edit: CompanionEdit) => {
		if (status || !result?.companions) return;
		setError("");
		setEdits((current) =>
			stagedList.stageCompanion(current, edit, {
				summary: result.companions,
				catalog: companionCatalog,
			}),
		);
	};

	/**
	 * Replaces a section's staged edits with that section's own view of what it
	 * has queued. The rule is `stagedList.replaceSection`; what stays here is the
	 * guard that ignores a panel's change while a download is running.
	 */
	const replaceEdits = useCallback(
		(matches: (edit: SaveEdit) => boolean, next: SaveEdit[]) => {
			if (status) return;
			setError("");
			setEdits((current) => stagedList.replaceSection(current, matches, next));
		},
		[status],
	);

	const stageDyes = useCallback(
		(next: DyeEdit[]) => replaceEdits((edit) => edit.type === "dye", next),
		[replaceEdits],
	);
	const stageConditions = useCallback(
		(next: ItemConditionEdit[]) =>
			replaceEdits((edit) => edit.type === "condition", next),
		[replaceEdits],
	);
	const stageLevels = useCallback(
		(next: LevelEdit[]) =>
			replaceEdits(
				(edit) => edit.type === "character" || edit.type === "characterPreset",
				next,
			),
		[replaceEdits],
	);
	const stageQuests = useCallback(
		(next: QuestStateEdit[]) =>
			replaceEdits(
				(edit) => edit.type === "quest" || edit.type === "questPreset",
				next,
			),
		[replaceEdits],
	);
	const stageNames = useCallback(
		(next: CompanionRenameEdit[]) =>
			replaceEdits((edit) => edit.type === "renameCompanion", next),
		[replaceEdits],
	);

	const nameOf = useCallback(
		(itemKey: number) =>
			catalog?.items[String(itemKey)]?.name ?? `Unknown item ${itemKey}`,
		[catalog],
	);

	const stageSkill = (edit: SkillEdit) => {
		if (status || !result?.skills || result.skills.error) return;
		setError("");
		setEdits((current) => stagedList.stageProgression(current, edit));
	};

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

	const pageTitle =
		view === "inventory"
			? result && activeStorage !== null
				? storageName(activeStorage)
				: "Save Editor"
			: isEditorView(view)
				? editorViewInfo[view].label
				: companionLabels[view];

	const pageSubtitle =
		view === "inventory"
			? result
				? `${itemTypes} item types in this location`
				: "Load a save, make changes and download the edited file"
			: isEditorView(view)
				? editorViewInfo[view].blurb
				: "Pets, horses, special mounts and camp mercenaries";

	const commands = useMemo<Command[]>(() => {
		const list: Command[] = [
			{
				id: "toggle-theme",
				label: "Toggle light / dark theme",
				keywords: "theme dark light mode appearance",
				icon: dark ? <Sun size={16} /> : <Moon size={16} />,
				run: () => setColorScheme(dark ? "light" : "dark"),
			},
			{
				id: "keyboard-shortcuts",
				label: "Keyboard shortcuts",
				keywords: "shortcuts keyboard keys help",
				icon: <Keyboard size={16} />,
				run: () => shortcuts.open(),
			},
		];
		if (edits.length > 0) {
			list.push({
				id: "undo-last-change",
				label: "Undo last change",
				hint: `${edits.length} staged`,
				keywords: "undo revert staged change",
				icon: <Undo2 size={16} />,
				run: () => setEdits((current) => current.slice(0, -1)),
			});
		}
		if (result) {
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
					run: () => {
						setView(id);
						setAddOpen(false);
					},
				});
			}
		}
		return list;
	}, [dark, setColorScheme, shortcuts.open, edits.length, result]);

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
				<Alert
					color="yellow"
					role="status"
					icon={<TriangleAlert size={16} strokeWidth={2} />}
					title={`${result.skippedRecords} inventory record${
						result.skippedRecords === 1 ? "" : "s"
					} could not be read`}
					mx="md"
					mt="md"
					style={{ flexShrink: 0 }}
				>
					These records are withheld rather than shown with guessed values, so
					the editor cannot change them. The rest of the save is unaffected:{" "}
					{result.skippedDetails.join("; ")}.
				</Alert>
			)}
			{view === "skills" ? (
				<SkillsPanel
					key="skills"
					description={result.skills}
					edit={edits.find(
						(entry): entry is SkillEdit => entry.type === "skills",
					)}
					busy={loading}
					error={error}
					onStage={stageSkill}
					onDiscard={() =>
						setEdits((current) =>
							current.filter((entry) => entry.type !== "skills"),
						)
					}
				/>
			) : view === "levels" ? (
				<LevelsPanel
					key="levels"
					description={result.levels}
					edits={edits.filter(
						(entry): entry is LevelEdit =>
							entry.type === "character" || entry.type === "characterPreset",
					)}
					busy={loading}
					error={error}
					onStage={stageLevels}
				/>
			) : view === "quests" ? (
				<QuestsPanel
					key="quests"
					session={session}
					edits={edits.filter(
						(entry): entry is QuestStateEdit =>
							entry.type === "quest" || entry.type === "questPreset",
					)}
					busy={loading}
					error={error}
					onStage={stageQuests}
				/>
			) : view === "dyes" ? (
				<DyesPanel
					key="dyes"
					description={result.dyes}
					edits={edits.filter(
						(entry): entry is DyeEdit => entry.type === "dye",
					)}
					busy={loading}
					error={error}
					onStage={stageDyes}
				/>
			) : view === "condition" ? (
				<ConditionPanel
					key="condition"
					description={result.conditions}
					nameOf={nameOf}
					edits={edits.filter(
						(entry): entry is ItemConditionEdit => entry.type === "condition",
					)}
					busy={loading}
					error={error}
					onStage={stageConditions}
				/>
			) : view === "names" ? (
				<NamesPanel
					key="names"
					description={result.names}
					edits={edits.filter(
						(entry): entry is CompanionRenameEdit =>
							entry.type === "renameCompanion",
					)}
					busy={loading}
					error={error}
					onStage={stageNames}
				/>
			) : view !== "inventory" ? (
				<CompanionPanel
					key={view}
					category={view}
					summary={result.companions}
					catalog={companionCatalog}
					edits={companionEdits}
					busy={loading}
					error={error}
					onStage={stageCompanion}
					onDiscard={(edit) =>
						setEdits((current) => current.filter((e) => e !== edit))
					}
				/>
			) : null}
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
			onToggleTheme={() => setColorScheme(dark ? "light" : "dark")}
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
