import {
	Badge,
	Button,
	Group,
	Modal,
	Pagination,
	SegmentedControl,
	Stack,
	Table,
	Text,
	TextInput,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import {
	Download,
	Pencil,
	Plus,
	RefreshCw,
	Search,
	Trash2,
	Upload,
} from "lucide-react";
import { type ChangeEvent, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import {
	addRawBirthday,
	birthdaySchema,
	getKindColor,
	getRawBirthdays,
	type RawBirthday,
	resetRawBirthdays,
	saveRawBirthdays,
} from "./birthdays";
import { ConfirmPopover } from "./ConfirmPopover";
import { notify } from "./notify";

type ManageBirthdaysModalProps = {
	open: boolean;
	onClose: () => void;
};

const PAGE_SIZE = 8;

/**
 * Structural identity of a stored record: the `(name, date)` pair the CRUD
 * helpers in `birthdays.ts` key on, so it is what "the same birthday" means
 * here too. The unit separator cannot occur in a `date` (Zod validates it as a
 * dayjs-parsable date), so the concatenation stays unambiguous even when a
 * `name` contains the separator itself.
 */
const identityOf = (record: RawBirthday) =>
	`${record.name}\u001F${record.date}`;

type RawBirthdayRow = {
	record: RawBirthday;
	/**
	 * 0-based position of this record among the records sharing its identity.
	 * Data stored before uniqueness was enforced can still hold duplicates, and
	 * a duplicate row can only be told apart from its twin by this number.
	 */
	occurrence: number;
	/** Collision-free React key: the identity plus that occurrence. */
	key: string;
};

/** Pairs every record with a collision-free key and its occurrence index. */
export const withRawKeys = (list: readonly RawBirthday[]): RawBirthdayRow[] => {
	const seen = new Map<string, number>();
	return list.map((record) => {
		const identity = identityOf(record);
		const occurrence = seen.get(identity) ?? 0;
		seen.set(identity, occurrence + 1);
		return { record, occurrence, key: `${identity}#${occurrence}` };
	});
};

/** Index of the `occurrence`-th record sharing `record`'s identity, or -1. */
export const indexOfOccurrence = (
	list: readonly RawBirthday[],
	record: RawBirthday,
	occurrence: number,
): number => {
	const identity = identityOf(record);
	let seen = 0;
	for (let index = 0; index < list.length; index++) {
		const candidate = list[index];
		if (!candidate || identityOf(candidate) !== identity) continue;
		if (seen === occurrence) return index;
		seen++;
	}
	return -1;
};

/**
 * Whether `(name, date)` is already taken. `excludeIndex` is the index of the
 * record being edited, which must not collide with itself when it is saved
 * unchanged.
 */
export const hasDuplicate = (
	list: readonly RawBirthday[],
	candidate: RawBirthday,
	excludeIndex = -1,
): boolean => {
	const identity = identityOf(candidate);
	return list.some(
		(x, index) => index !== excludeIndex && identityOf(x) === identity,
	);
};

/**
 * Keeps the first record of each identity and reports the rest, so a bulk
 * import cannot introduce duplicates in one step.
 */
export const dedupeRecords = (list: readonly RawBirthday[]) => {
	const seen = new Set<string>();
	const records: RawBirthday[] = [];
	let duplicateCount = 0;
	for (const record of list) {
		const identity = identityOf(record);
		if (seen.has(identity)) {
			duplicateCount++;
			continue;
		}
		seen.add(identity);
		records.push(record);
	}
	return { records, duplicateCount };
};

export const ManageBirthdaysModal = ({
	open,
	onClose,
}: ManageBirthdaysModalProps) => {
	const { t } = useTranslation();
	const [list, setList] = useState<RawBirthday[]>(() => getRawBirthdays());
	const [editingItem, setEditingItem] = useState<{
		original: RawBirthday;
		occurrence: number;
		isNew: boolean;
	} | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [page, setPage] = useState(0);
	const [pendingImport, setPendingImport] = useState<{
		records: RawBirthday[];
		duplicateCount: number;
	} | null>(null);
	const [discardOpen, setDiscardOpen] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const [formName, setFormName] = useState("");
	const [formDate, setFormDate] = useState<string | null>(null);
	const [formKind, setFormKind] = useState<RawBirthday["kind"]>("♂️");
	const [errors, setErrors] = useState<{
		name?: string;
		date?: string;
		kind?: string;
	}>({});

	const refreshList = () => {
		setList(getRawBirthdays());
	};

	const handleOpenAdd = () => {
		setErrors({});
		setFormName("");
		setFormDate("1995-01-01");
		setFormKind("♂️");
		setDiscardOpen(false);
		setEditingItem({
			original: { name: "", date: "1995-01-01", kind: "♂️" },
			occurrence: 0,
			isNew: true,
		});
	};

	const handleOpenEdit = (row: RawBirthdayRow) => {
		setErrors({});
		setFormName(row.record.name);
		setFormDate(row.record.date);
		setFormKind(row.record.kind);
		setDiscardOpen(false);
		setEditingItem({
			original: row.record,
			occurrence: row.occurrence,
			isNew: false,
		});
	};

	const closeEditor = () => {
		setEditingItem(null);
		setDiscardOpen(false);
	};

	const isDirty = editingItem
		? formName.trim() !== editingItem.original.name ||
			(formDate ?? "") !== editingItem.original.date ||
			formKind !== editingItem.original.kind
		: false;

	const requestCloseEditor = () => {
		if (isDirty) {
			setDiscardOpen(true);
		} else {
			closeEditor();
		}
	};

	const handleSaveForm = () => {
		const name = formName.trim();
		if (!name) {
			setErrors({ name: t("manage.name_required") });
			return;
		}
		if (!formDate) {
			setErrors({ date: t("manage.date_required") });
			return;
		}
		if (!formKind) {
			setErrors({ kind: t("manage.kind_required") });
			return;
		}

		const newItem: RawBirthday = {
			name,
			date: formDate,
			kind: formKind,
		};

		const editing = editingItem;
		// Resolve the edited record against the list as it stands right now, so
		// an edit never falls through to a twin sharing the same identity.
		const current = getRawBirthdays();
		const selfIndex =
			editing && !editing.isNew
				? indexOfOccurrence(current, editing.original, editing.occurrence)
				: -1;

		if (hasDuplicate(current, newItem, selfIndex)) {
			setErrors({
				name: t("manage.duplicate_entry", { name, date: formDate }),
			});
			return;
		}

		if (editing?.isNew) {
			addRawBirthday(newItem);
			notify.success(t("manage.added", { name: newItem.name }));
		} else if (editing) {
			if (selfIndex < 0) {
				notify.error(t("manage.record_missing"));
				return;
			}
			// Patch that one slot: `updateRawBirthday` in `birthdays.ts` uses
			// `findIndex`, so on legacy duplicates it would rewrite the first
			// match instead of the row the user actually opened.
			const next = [...current];
			next[selfIndex] = newItem;
			saveRawBirthdays(next);
			notify.success(t("manage.updated", { name: newItem.name }));
		}

		closeEditor();
		refreshList();
	};

	const handleDelete = (row: RawBirthdayRow) => {
		const current = getRawBirthdays();
		const index = indexOfOccurrence(current, row.record, row.occurrence);
		if (index < 0) {
			notify.error(t("manage.record_missing"));
			refreshList();
			return;
		}
		// Drop exactly one record: `deleteRawBirthday` in `birthdays.ts` filters
		// out every record matching the identity, which on legacy duplicates
		// would take out the whole group at once.
		const next = current.filter((_, at) => at !== index);
		saveRawBirthdays(next);
		notify.success(t("manage.deleted", { name: row.record.name }));
		refreshList();
	};

	const handleReset = () => {
		resetRawBirthdays();
		notify.info(t("manage.reset_notify"));
		refreshList();
	};

	const handleExportJSON = () => {
		const dataStr =
			"data:text/json;charset=utf-8," +
			encodeURIComponent(JSON.stringify(getRawBirthdays(), null, 2));
		const downloadAnchor = document.createElement("a");
		downloadAnchor.setAttribute("href", dataStr);
		downloadAnchor.setAttribute("download", "birthdays.json");
		document.body.appendChild(downloadAnchor);
		downloadAnchor.click();
		downloadAnchor.remove();
		notify.success(t("manage.exported"));
	};

	const handleImportJSON = (e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		// Clear the input so selecting the same file again still fires onChange.
		e.target.value = "";
		if (!file) return;

		const fileReader = new FileReader();
		fileReader.readAsText(file, "UTF-8");
		fileReader.onload = (event) => {
			try {
				const parsed: unknown = JSON.parse(String(event.target?.result ?? ""));
				const result = z.array(birthdaySchema).safeParse(parsed);
				if (!result.success) {
					notify.error(t("manage.import_invalid"));
					return;
				}
				// Duplicates inside the file are dropped here rather than on
				// confirm, and counted so the user is told what was left out.
				setPendingImport(dedupeRecords(result.data));
			} catch {
				notify.error(t("manage.import_parse_error"));
			}
		};
	};

	const confirmImport = () => {
		if (!pendingImport) return;
		const { records, duplicateCount } = pendingImport;
		if (records.length === 0) {
			// Only an empty file gets here (dedupe always keeps the first record
			// of an identity). Importing it would silently wipe the list.
			notify.error(t("manage.import_invalid"));
			setPendingImport(null);
			return;
		}
		saveRawBirthdays(records);
		notify.success(t("manage.imported", { count: records.length }));
		if (duplicateCount > 0) {
			notify.warning(
				t("manage.import_duplicates_skipped", { count: duplicateCount }),
			);
		}
		setPendingImport(null);
		refreshList();
	};

	const rows = useMemo(() => withRawKeys(list), [list]);
	const filteredRows = rows.filter((row) =>
		row.record.name.toLowerCase().includes(searchQuery.toLowerCase()),
	);

	const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
	const currentPage = Math.min(page, pageCount - 1);
	const visibleRows = filteredRows.slice(
		currentPage * PAGE_SIZE,
		(currentPage + 1) * PAGE_SIZE,
	);

	return (
		<Modal title={t("manage.title")} opened={open} onClose={onClose} size="lg">
			<Stack gap="md">
				<Group justify="space-between" align="center" wrap="wrap">
					<Group wrap="wrap">
						<Button leftSection={<Plus size={16} />} onClick={handleOpenAdd}>
							{t("manage.add")}
						</Button>
						<Button
							variant="default"
							leftSection={<Download size={16} />}
							onClick={handleExportJSON}
						>
							{t("manage.export_json")}
						</Button>
						<input
							ref={fileInputRef}
							type="file"
							accept=".json"
							onChange={handleImportJSON}
							style={{ display: "none" }}
						/>
						<ConfirmPopover
							title={t("manage.import_title", {
								count: pendingImport?.records.length ?? 0,
							})}
							confirmLabel={t("manage.import_confirm")}
							cancelLabel={t("common.cancel")}
							danger
							opened={pendingImport !== null}
							onOpenChange={(next) => {
								if (!next) {
									setPendingImport(null);
								}
							}}
							onConfirm={confirmImport}
						>
							<Button
								variant="default"
								leftSection={<Upload size={16} />}
								onClick={() => fileInputRef.current?.click()}
							>
								{t("manage.import_json")}
							</Button>
						</ConfirmPopover>
					</Group>
					<ConfirmPopover
						title={t("manage.reset_title")}
						confirmLabel={t("manage.reset_confirm")}
						cancelLabel={t("common.cancel")}
						danger
						onConfirm={handleReset}
					>
						<Button
							variant="default"
							color="red"
							leftSection={<RefreshCw size={16} />}
						>
							{t("manage.reset_defaults")}
						</Button>
					</ConfirmPopover>
				</Group>

				<TextInput
					placeholder={t("manage.search_placeholder")}
					aria-label={t("manage.search_placeholder")}
					leftSection={<Search size={14} />}
					value={searchQuery}
					onChange={(e) => {
						setSearchQuery(e.target.value);
						setPage(0);
					}}
					style={{ width: "100%" }}
				/>

				<Table className="tk-table" verticalSpacing="xs" highlightOnHover>
					<Table.Thead>
						<Table.Tr>
							<Table.Th>{t("manage.col_name")}</Table.Th>
							<Table.Th>{t("manage.col_date")}</Table.Th>
							<Table.Th ta="right">{t("manage.col_actions")}</Table.Th>
						</Table.Tr>
					</Table.Thead>
					<Table.Tbody>
						{visibleRows.map((row) => {
							const r = row.record;
							return (
								<Table.Tr key={row.key}>
									<Table.Td>
										<Badge color={getKindColor(r.kind)} variant="light">
											{r.name} {r.kind}
										</Badge>
									</Table.Td>
									<Table.Td>
										<span>📅 {r.date}</span>
									</Table.Td>
									<Table.Td ta="right">
										<Group gap="xs" justify="flex-end" wrap="nowrap">
											<Button
												size="xs"
												variant="default"
												onClick={() => handleOpenEdit(row)}
												aria-label={t("manage.edit_aria", { name: r.name })}
											>
												<Pencil size={14} />
											</Button>
											<ConfirmPopover
												title={t("manage.delete_title", { name: r.name })}
												confirmLabel={t("manage.delete_confirm")}
												cancelLabel={t("common.cancel")}
												danger
												onConfirm={() => handleDelete(row)}
											>
												<Button
													size="xs"
													variant="default"
													color="red"
													aria-label={t("manage.delete_aria", {
														name: r.name,
													})}
												>
													<Trash2 size={14} />
												</Button>
											</ConfirmPopover>
										</Group>
									</Table.Td>
								</Table.Tr>
							);
						})}
						{visibleRows.length === 0 && (
							<Table.Tr>
								<Table.Td colSpan={3}>
									<Text size="sm" c="dimmed" ta="center" py="md">
										{t("manage.no_results")}
									</Text>
								</Table.Td>
							</Table.Tr>
						)}
					</Table.Tbody>
				</Table>

				{filteredRows.length > PAGE_SIZE && (
					<Group justify="center">
						<Pagination
							size="sm"
							total={pageCount}
							value={currentPage + 1}
							onChange={(next) => setPage(next - 1)}
						/>
					</Group>
				)}
			</Stack>

			{/* Add/Edit Sub-Modal */}
			<Modal
				title={
					editingItem?.isNew ? t("manage.add_title") : t("manage.edit_title")
				}
				opened={editingItem !== null}
				onClose={requestCloseEditor}
				size="md"
			>
				<Stack gap="sm">
					<TextInput
						label={t("manage.name_label")}
						placeholder={t("manage.name_placeholder")}
						value={formName}
						error={errors.name}
						onChange={(e) => setFormName(e.target.value)}
					/>
					<DatePickerInput
						label={t("manage.date_label")}
						valueFormat="YYYY-MM-DD"
						value={formDate}
						error={errors.date}
						onChange={setFormDate}
					/>
					<div>
						<Text size="sm" fw={500} mb={4}>
							{t("manage.category")}
						</Text>
						<SegmentedControl
							fullWidth
							value={formKind}
							onChange={(value) => setFormKind(value as RawBirthday["kind"])}
							data={[
								{ label: t("manage.boy"), value: "♂️" },
								{ label: t("manage.girl"), value: "♀️" },
								{ label: t("manage.wedding"), value: "💒" },
							]}
						/>
						{errors.kind && (
							<Text size="xs" c="red" mt={4}>
								{errors.kind}
							</Text>
						)}
					</div>
					<Group justify="flex-end" mt="sm">
						<ConfirmPopover
							title={t("manage.discard_title")}
							confirmLabel={t("manage.discard_confirm")}
							cancelLabel={t("common.cancel")}
							danger
							opened={discardOpen}
							onOpenChange={(next) => {
								if (!next) setDiscardOpen(false);
							}}
							onConfirm={closeEditor}
						>
							<Button variant="default" onClick={requestCloseEditor}>
								{t("common.cancel")}
							</Button>
						</ConfirmPopover>
						<Button onClick={handleSaveForm}>{t("manage.save")}</Button>
					</Group>
				</Stack>
			</Modal>
		</Modal>
	);
};
