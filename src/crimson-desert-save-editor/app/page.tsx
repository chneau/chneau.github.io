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
	useMantineColorScheme,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AddItemDrawer } from "@/components/add-item-drawer";
import { AppSidebar } from "@/components/app-sidebar";
import { CompanionPanel } from "@/components/companion-panel";
import { ConditionPanel } from "@/components/condition-panel";
import { DyesPanel } from "@/components/dyes-panel";
import { EquipmentCatalogPanel } from "@/components/equipment-catalog-panel";
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
import { StagedEditsDrawer } from "@/components/staged-edits-drawer";
import {
	type CompanionCatalog,
	type CompanionEdit,
	companionLabels,
} from "@/lib/companions";
import type { EquipmentEdit, InsertEquipmentEdit } from "@/lib/equipment";
import companionCatalogData from "@/lib/generated/companion-catalog.json";
import {
	type CatalogItem,
	editorViewInfo,
	isEditorView,
	type ParseResult,
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
import { type SaveEngineEvent, SaveSession } from "@/lib/save-engine/session";
import type { SkillEdit } from "@/lib/skills";
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
	AppHeader,
	AppSwitcher,
	BackHome,
	Brand,
	HeaderAction,
	SchemeToggle,
	ShortcutsHelp,
	ShortcutsHelpButton,
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
	const session = useMemo(() => new SaveSession(), []);
	const currentFileNameRef = useRef("save.save");
	const [navOpened, navHandlers] = useDisclosure(false);
	const isDesktop = useMediaQuery("(min-width: 48em)") ?? true;
	const [baseCatalog, setCatalog] = useState<ItemCatalogFile | null>(null);
	const [equipmentCatalog, setEquipmentCatalog] =
		useState<EquipmentCatalog | null>(null);
	const companionCatalog = companionCatalogData as CompanionCatalog;
	const [view, setView] = useState<SaveView>("inventory");
	const catalog = useMemo(() => {
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
	const [discardModalOpen, setDiscardModalOpen] = useState(false);
	const [reviewOpen, setReviewOpen] = useState(false);
	const [stagedMenuOpen, setStagedMenuOpen] = useState(false);
	const [activeStorage, setActiveStorage] = useState<number | null>(null);
	const [addOpen, setAddOpen] = useState(false);
	const [edits, setEdits] = useState<SaveEdit[]>([]);
	const shortcuts = useShortcutsHelp();

	const removeStagedEdit = (index: number) => {
		setEdits((current) => current.filter((_, i) => i !== index));
	};
	/** What a staged change just selected, so the inventory view follows it. */
	const [focus, setFocus] = useState<InventoryFocus | null>(null);

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

	useEffect(() => {
		return () => session.reset();
	}, [session]);

	const handleEngineEvent = useCallback((event: SaveEngineEvent) => {
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
			setResult(parsed);
			setActiveStorage(keys.includes(2) ? 2 : (keys[0] ?? null));
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
	}, []);

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
			setView("inventory");
			setActiveStorage(null);
			setFocus(null);
			setAddOpen(false);
			setEdits([]);
			setError("");
			setStatus("Reading file locally…");

			const buffer = await file.arrayBuffer();
			void session.parse(buffer, handleEngineEvent);
		},
		[handleEngineEvent, session],
	);

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

	const loading = Boolean(status);

	const { stagedStorageCounts, stagedViewCounts } = useMemo(() => {
		const storageCounts: Record<number, number> = {};
		const viewCounts: Record<SaveView, number> = {
			inventory: 0,
			skills: 0,
			levels: 0,
			quests: 0,
			dyes: 0,
			condition: 0,
			names: 0,
			pets: 0,
			mounts: 0,
			specialMounts: 0,
			camp: 0,
		};

		for (const edit of edits) {
			if (edit.type === "condition") {
				storageCounts[edit.inventoryKey] =
					(storageCounts[edit.inventoryKey] ?? 0) + 1;
				viewCounts.condition++;
			} else if ("inventoryKey" in edit) {
				storageCounts[edit.inventoryKey] =
					(storageCounts[edit.inventoryKey] ?? 0) + 1;
				viewCounts.inventory++;
			} else if (edit.type === "skills") {
				viewCounts.skills++;
			} else if (edit.type === "character" || edit.type === "characterPreset") {
				viewCounts.levels++;
			} else if (edit.type === "quest" || edit.type === "questPreset") {
				viewCounts.quests++;
			} else if (edit.type === "dye") {
				viewCounts.dyes++;
			} else if (edit.type === "renameCompanion") {
				viewCounts.names++;
			} else if (
				edit.type === "addCompanion" ||
				edit.type === "addRoboWorkers"
			) {
				viewCounts[edit.category] = (viewCounts[edit.category] ?? 0) + 1;
			}
		}

		return { stagedStorageCounts: storageCounts, stagedViewCounts: viewCounts };
	}, [edits]);

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

	return (
		<Flex
			h="100dvh"
			w="100%"
			style={{
				overflow: "hidden",
				backgroundImage:
					"radial-gradient(circle at 82% -10%, rgba(157, 80, 98, 0.16), transparent 34rem)",
			}}
		>
			{isDesktop && sidebar}
			<Drawer
				opened={!isDesktop && navOpened}
				onClose={navHandlers.close}
				position="left"
				size={272}
				withCloseButton={false}
				padding={0}
				styles={{ body: { height: "100%" } }}
			>
				{sidebar}
			</Drawer>

			<Flex direction="column" style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
				<AppHeader
					staticPosition
					brand={
						<>
							{!isDesktop && (
								<Burger
									opened={navOpened}
									onClick={navHandlers.toggle}
									size="sm"
									aria-label="Toggle navigation"
								/>
							)}
							<Brand title={pageTitle} subtitle={pageSubtitle} />
						</>
					}
					actions={
						<>
							<BackHome />
							<AppSwitcher />
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
									<Badge
										variant="outline"
										color="brand"
										visibleFrom="lg"
										h={28}
									>
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
													onClick={() => setReviewOpen(true)}
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
													onClick={() => setDiscardModalOpen(true)}
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
										icon={
											loading ? <Loader size={16} /> : <Download size={16} />
										}
										onClick={downloadEditedSave}
									>
										Download save
										{edits.length > 0 ? ` (${edits.length})` : ""}
									</HeaderAction>
								</>
							)}
							<ShortcutsHelpButton
								onClick={shortcuts.open}
								expanded={shortcuts.opened}
							/>
							<SchemeToggle
								dark={dark}
								onToggle={() => setColorScheme(dark ? "light" : "dark")}
							/>
						</>
					}
				/>
				<input
					ref={inputRef}
					type="file"
					accept=".save"
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
						if (file) void parseFile(file);
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
							value={
								(downloadProgress.completed / downloadProgress.total) * 100
							}
							aria-label="Save preparation progress"
						/>
						<Text mt="xs" size="xs" c="dimmed">
							{elapsed}s elapsed. Large saves can take several minutes. Keep
							this tab open; the download starts automatically when validation
							finishes.
						</Text>
					</Box>
				)}

				{!result ? (
					<LandingView
						loading={loading}
						status={status}
						error={error}
						onOpenFile={() => inputRef.current?.click()}
						onSelectFile={(file) => void parseFile(file)}
					/>
				) : (
					<>
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
										entry.type === "character" ||
										entry.type === "characterPreset",
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
									(entry): entry is ItemConditionEdit =>
										entry.type === "condition",
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
				)}

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
				onClose={() => setReviewOpen(false)}
				edits={edits}
				nameOf={nameOf}
				onRemoveEdit={removeStagedEdit}
				onDiscardAll={() => setDiscardModalOpen(true)}
				onDownload={downloadEditedSave}
				busy={loading}
			/>

			<ShortcutsHelp
				opened={shortcuts.opened}
				onClose={shortcuts.close}
				groups={[
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
						<Button
							variant="default"
							onClick={() => setDiscardModalOpen(false)}
						>
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
		</Flex>
	);
};
