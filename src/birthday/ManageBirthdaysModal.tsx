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
import { type ChangeEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import {
	addRawBirthday,
	birthdaySchema,
	deleteRawBirthday,
	getKindColor,
	getRawBirthdays,
	type RawBirthday,
	resetRawBirthdays,
	saveRawBirthdays,
	updateRawBirthday,
} from "./birthdays";
import { ConfirmPopover } from "./ConfirmPopover";
import { notify } from "./notify";

type ManageBirthdaysModalProps = {
	open: boolean;
	onClose: () => void;
};

const PAGE_SIZE = 8;

export const ManageBirthdaysModal = ({
	open,
	onClose,
}: ManageBirthdaysModalProps) => {
	const { t } = useTranslation();
	const [list, setList] = useState<RawBirthday[]>(() => getRawBirthdays());
	const [editingItem, setEditingItem] = useState<{
		original: RawBirthday;
		isNew: boolean;
	} | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [page, setPage] = useState(0);
	const [pendingImport, setPendingImport] = useState<RawBirthday[] | null>(
		null,
	);
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
			isNew: true,
		});
	};

	const handleOpenEdit = (record: RawBirthday) => {
		setErrors({});
		setFormName(record.name);
		setFormDate(record.date);
		setFormKind(record.kind);
		setDiscardOpen(false);
		setEditingItem({
			original: record,
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
		if (!formName.trim()) {
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
			name: formName.trim(),
			date: formDate,
			kind: formKind,
		};

		if (editingItem?.isNew) {
			addRawBirthday(newItem);
			notify.success(t("manage.added", { name: newItem.name }));
		} else if (editingItem) {
			updateRawBirthday(
				{
					name: editingItem.original.name,
					date: editingItem.original.date,
				},
				newItem,
			);
			notify.success(t("manage.updated", { name: newItem.name }));
		}

		closeEditor();
		refreshList();
	};

	const handleDelete = (record: RawBirthday) => {
		deleteRawBirthday({ name: record.name, date: record.date });
		notify.success(t("manage.deleted", { name: record.name }));
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
				setPendingImport(result.data);
			} catch {
				notify.error(t("manage.import_parse_error"));
			}
		};
	};

	const confirmImport = () => {
		if (!pendingImport) return;
		saveRawBirthdays(pendingImport);
		notify.success(t("manage.imported", { count: pendingImport.length }));
		setPendingImport(null);
		refreshList();
	};

	const filteredList = list.filter((b) =>
		b.name.toLowerCase().includes(searchQuery.toLowerCase()),
	);

	const pageCount = Math.max(1, Math.ceil(filteredList.length / PAGE_SIZE));
	const currentPage = Math.min(page, pageCount - 1);
	const visibleList = filteredList.slice(
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
								count: pendingImport?.length ?? 0,
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
						{visibleList.map((r) => (
							<Table.Tr key={`${r.name}-${r.date}`}>
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
											onClick={() => handleOpenEdit(r)}
											aria-label={t("manage.edit_aria", { name: r.name })}
										>
											<Pencil size={14} />
										</Button>
										<ConfirmPopover
											title={t("manage.delete_title", { name: r.name })}
											confirmLabel={t("manage.delete_confirm")}
											cancelLabel={t("common.cancel")}
											danger
											onConfirm={() => handleDelete(r)}
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
						))}
						{visibleList.length === 0 && (
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

				{filteredList.length > PAGE_SIZE && (
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
