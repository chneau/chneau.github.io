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
import { type ChangeEvent, useState } from "react";
import {
	addRawBirthday,
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
	const [list, setList] = useState<RawBirthday[]>(() => getRawBirthdays());
	const [editingItem, setEditingItem] = useState<{
		original: RawBirthday;
		isNew: boolean;
	} | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [page, setPage] = useState(0);

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
		setEditingItem({
			original: record,
			isNew: false,
		});
	};

	const handleSaveForm = () => {
		if (!formName.trim()) {
			setErrors({ name: "Please enter a name" });
			return;
		}
		if (!formDate) {
			setErrors({ date: "Please select a date" });
			return;
		}
		if (!formKind) {
			setErrors({ kind: "Please select a category" });
			return;
		}

		const newItem: RawBirthday = {
			name: formName.trim(),
			date: formDate,
			kind: formKind,
		};

		if (editingItem?.isNew) {
			addRawBirthday(newItem);
			notify.success(`Added ${newItem.name}`);
		} else if (editingItem) {
			updateRawBirthday(
				{
					name: editingItem.original.name,
					date: editingItem.original.date,
				},
				newItem,
			);
			notify.success(`Updated ${newItem.name}`);
		}

		setEditingItem(null);
		refreshList();
	};

	const handleDelete = (record: RawBirthday) => {
		deleteRawBirthday({ name: record.name, date: record.date });
		notify.success(`Deleted ${record.name}`);
		refreshList();
	};

	const handleReset = () => {
		resetRawBirthdays();
		notify.info("Reset to default birthdays");
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
		notify.success("Exported birthdays.json");
	};

	const handleImportJSON = (e: ChangeEvent<HTMLInputElement>) => {
		const fileReader = new FileReader();
		if (e.target.files?.[0]) {
			fileReader.readAsText(e.target.files[0], "UTF-8");
			fileReader.onload = (event) => {
				try {
					const parsed = JSON.parse(event.target?.result as string);
					if (Array.isArray(parsed)) {
						saveRawBirthdays(parsed);
						notify.success(`Imported ${parsed.length} birthdays!`);
						refreshList();
					} else {
						notify.error("Invalid JSON format: expected an array");
					}
				} catch {
					notify.error("Failed to parse JSON file");
				}
			};
		}
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
		<Modal
			title="🎂 Manage Birthdays"
			opened={open}
			onClose={onClose}
			size="lg"
		>
			<Stack gap="md">
				<Group justify="space-between" align="center" wrap="wrap">
					<Group wrap="wrap">
						<Button leftSection={<Plus size={16} />} onClick={handleOpenAdd}>
							Add Birthday
						</Button>
						<Button
							variant="default"
							leftSection={<Download size={16} />}
							onClick={handleExportJSON}
						>
							Export JSON
						</Button>
						<label style={{ display: "inline-block" }}>
							<Button
								variant="default"
								component="span"
								leftSection={<Upload size={16} />}
							>
								Import JSON
							</Button>
							<input
								type="file"
								accept=".json"
								onChange={handleImportJSON}
								style={{ display: "none" }}
							/>
						</label>
					</Group>
					<ConfirmPopover
						title="Reset all birthdays to default sample data?"
						confirmLabel="Reset"
						cancelLabel="Cancel"
						danger
						onConfirm={handleReset}
					>
						<Button
							variant="default"
							color="red"
							leftSection={<RefreshCw size={16} />}
						>
							Reset Defaults
						</Button>
					</ConfirmPopover>
				</Group>

				<TextInput
					placeholder="Search entries..."
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
							<Table.Th>Name</Table.Th>
							<Table.Th>Date</Table.Th>
							<Table.Th ta="right">Actions</Table.Th>
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
											aria-label={`Edit ${r.name}`}
										>
											<Pencil size={14} />
										</Button>
										<ConfirmPopover
											title={`Delete ${r.name}?`}
											confirmLabel="Delete"
											cancelLabel="Cancel"
											danger
											onConfirm={() => handleDelete(r)}
										>
											<Button
												size="xs"
												variant="default"
												color="red"
												aria-label={`Delete ${r.name}`}
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
										No birthdays found.
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
				title={editingItem?.isNew ? "Add Birthday" : "Edit Birthday"}
				opened={editingItem !== null}
				onClose={() => setEditingItem(null)}
				size="md"
			>
				<Stack gap="sm">
					<TextInput
						label="Name / Couple"
						placeholder="e.g. John Doe"
						value={formName}
						error={errors.name}
						onChange={(e) => setFormName(e.target.value)}
					/>
					<DatePickerInput
						label="Birth / Wedding Date"
						valueFormat="YYYY-MM-DD"
						value={formDate}
						error={errors.date}
						onChange={setFormDate}
					/>
					<div>
						<Text size="sm" fw={500} mb={4}>
							Category
						</Text>
						<SegmentedControl
							fullWidth
							value={formKind}
							onChange={(value) => setFormKind(value as RawBirthday["kind"])}
							data={[
								{ label: "♂️ Boy", value: "♂️" },
								{ label: "♀️ Girl", value: "♀️" },
								{ label: "💒 Wedding", value: "💒" },
							]}
						/>
						{errors.kind && (
							<Text size="xs" c="red" mt={4}>
								{errors.kind}
							</Text>
						)}
					</div>
					<Group justify="flex-end" mt="sm">
						<Button variant="default" onClick={() => setEditingItem(null)}>
							Cancel
						</Button>
						<Button onClick={handleSaveForm}>Save</Button>
					</Group>
				</Stack>
			</Modal>
		</Modal>
	);
};
