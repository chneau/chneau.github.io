import { Badge, Loader, Menu } from "@mantine/core";
import {
	CheckCircle2,
	Download,
	FileUp,
	HardDrive,
	Plus,
	Trash2,
	Undo2,
} from "lucide-react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { EquipmentCatalogPanel } from "@/components/equipment-catalog-panel";
import type { EquipmentCatalog } from "@/components/equipment-details";
import type { EquipmentEdit, InsertEquipmentEdit } from "@/lib/equipment";
import {
	type Catalog,
	type ParseResult,
	type SaveView,
	storageName,
} from "@/lib/inventory";
import type { SaveEdit } from "@/lib/staged-edits";
import { HeaderAction } from "../../shared";

/**
 * What sits to the right of the title once a save is open.
 *
 * Three groups that appear together and mean together: which file is open, what
 * is staged in it, and the ways out of here (add an item, download the rebuild).
 * Before a save is open only the file picker is offered, so this reads `result`
 * rather than the shell rendering two variants of the header.
 */
export const EditorHeaderActions = ({
	result,
	fileName,
	fileSize,
	catalog,
	equipmentCatalog,
	storages,
	activeStorage,
	edits,
	setEdits,
	stagedMenuOpen,
	setStagedMenuOpen,
	view,
	loading,
	inputRef,
	setAddOpen,
	stageEquipment,
	onReviewOpen,
	onDiscardOpen,
	onDownload,
}: {
	result: ParseResult | null;
	fileName: string;
	fileSize: number;
	catalog: Catalog | null;
	equipmentCatalog: EquipmentCatalog | null;
	storages: { key: number; records: number }[];
	activeStorage: number | null;
	edits: SaveEdit[];
	setEdits: Dispatch<SetStateAction<SaveEdit[]>>;
	stagedMenuOpen: boolean;
	setStagedMenuOpen: Dispatch<SetStateAction<boolean>>;
	view: SaveView;
	loading: boolean;
	inputRef: RefObject<HTMLInputElement | null>;
	setAddOpen: Dispatch<SetStateAction<boolean>>;
	stageEquipment: (edit: EquipmentEdit | InsertEquipmentEdit) => void;
	onReviewOpen: () => void;
	onDiscardOpen: () => void;
	onDownload: () => void;
}) => (
	// A fragment, not a `Group`: the header lays its own actions out, and a
	// wrapper here would add a second set of spacing rules to a bar that already
	// has them.
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
								onClick={() => setEdits((current) => current.slice(0, -1))}
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
);
