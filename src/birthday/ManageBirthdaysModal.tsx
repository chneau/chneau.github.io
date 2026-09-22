import {
	DeleteOutlined,
	DownloadOutlined,
	EditOutlined,
	PlusOutlined,
	ReloadOutlined,
	UploadOutlined,
} from "@ant-design/icons";
import {
	Button,
	DatePicker,
	Form,
	Input,
	Modal,
	message,
	Popconfirm,
	Radio,
	Space,
	Table,
	Tag,
} from "antd";
import dayjs from "dayjs";
import { useState } from "react";
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

type ManageBirthdaysModalProps = {
	open: boolean;
	onClose: () => void;
};

export const ManageBirthdaysModal = ({
	open,
	onClose,
}: ManageBirthdaysModalProps) => {
	const [list, setList] = useState<RawBirthday[]>(() => getRawBirthdays());
	const [editingItem, setEditingItem] = useState<{
		original: RawBirthday;
		isNew: boolean;
	} | null>(null);
	const [form] = Form.useForm();
	const [searchQuery, setSearchQuery] = useState("");

	const refreshList = () => {
		setList(getRawBirthdays());
	};

	const handleOpenAdd = () => {
		form.resetFields();
		form.setFieldsValue({
			kind: "♂️",
			date: dayjs("1995-01-01"),
		});
		setEditingItem({
			original: { name: "", date: "1995-01-01", kind: "♂️" },
			isNew: true,
		});
	};

	const handleOpenEdit = (record: RawBirthday) => {
		form.resetFields();
		form.setFieldsValue({
			name: record.name,
			date: dayjs(record.date),
			kind: record.kind,
		});
		setEditingItem({
			original: record,
			isNew: false,
		});
	};

	const handleSaveForm = async () => {
		try {
			const values = await form.validateFields();
			const formattedDate = values.date.format("YYYY-MM-DD");
			const newItem: RawBirthday = {
				name: values.name.trim(),
				date: formattedDate,
				kind: values.kind,
			};

			if (editingItem?.isNew) {
				addRawBirthday(newItem);
				message.success(`Added ${newItem.name}`);
			} else if (editingItem) {
				updateRawBirthday(
					{
						name: editingItem.original.name,
						date: editingItem.original.date,
					},
					newItem,
				);
				message.success(`Updated ${newItem.name}`);
			}

			setEditingItem(null);
			refreshList();
		} catch {
			// Validation error
		}
	};

	const handleDelete = (record: RawBirthday) => {
		deleteRawBirthday({ name: record.name, date: record.date });
		message.success(`Deleted ${record.name}`);
		refreshList();
	};

	const handleReset = () => {
		resetRawBirthdays();
		message.info("Reset to default birthdays");
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
		message.success("Exported birthdays.json");
	};

	const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
		const fileReader = new FileReader();
		if (e.target.files?.[0]) {
			fileReader.readAsText(e.target.files[0], "UTF-8");
			fileReader.onload = (event) => {
				try {
					const parsed = JSON.parse(event.target?.result as string);
					if (Array.isArray(parsed)) {
						saveRawBirthdays(parsed);
						message.success(`Imported ${parsed.length} birthdays!`);
						refreshList();
					} else {
						message.error("Invalid JSON format: expected an array");
					}
				} catch {
					message.error("Failed to parse JSON file");
				}
			};
		}
	};

	const filteredList = list.filter((b) =>
		b.name.toLowerCase().includes(searchQuery.toLowerCase()),
	);

	return (
		<Modal
			title="🎂 Manage Birthdays"
			open={open}
			onCancel={onClose}
			footer={null}
			width={720}
		>
			<Space
				direction="vertical"
				style={{ width: "100%", marginBottom: 16 }}
				size="middle"
			>
				<Space wrap style={{ justifyContent: "space-between", width: "100%" }}>
					<Space wrap>
						<Button
							type="primary"
							icon={<PlusOutlined />}
							onClick={handleOpenAdd}
						>
							Add Birthday
						</Button>
						<Button icon={<DownloadOutlined />} onClick={handleExportJSON}>
							Export JSON
						</Button>
						<label style={{ display: "inline-block" }}>
							<Button icon={<UploadOutlined />}>Import JSON</Button>
							<input
								type="file"
								accept=".json"
								onChange={handleImportJSON}
								style={{ display: "none" }}
							/>
						</label>
					</Space>
					<Popconfirm
						title="Reset all birthdays to default sample data?"
						onConfirm={handleReset}
						okText="Reset"
						cancelText="Cancel"
					>
						<Button icon={<ReloadOutlined />} danger>
							Reset Defaults
						</Button>
					</Popconfirm>
				</Space>

				<Input.Search
					placeholder="Search entries..."
					allowClear
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					style={{ width: "100%" }}
				/>

				<Table
					dataSource={filteredList}
					rowKey={(r) => `${r.name}-${r.date}`}
					size="small"
					pagination={{ pageSize: 8 }}
					columns={[
						{
							title: "Name",
							dataIndex: "name",
							render: (name, r) => (
								<Tag color={getKindColor(r.kind)}>
									{name} {r.kind}
								</Tag>
							),
						},
						{
							title: "Date",
							dataIndex: "date",
							render: (d) => <span>📅 {d}</span>,
						},
						{
							title: "Actions",
							key: "actions",
							align: "right",
							render: (_, r) => (
								<Space size="small">
									<Button
										size="small"
										icon={<EditOutlined />}
										onClick={() => handleOpenEdit(r)}
									/>
									<Popconfirm
										title={`Delete ${r.name}?`}
										onConfirm={() => handleDelete(r)}
										okText="Delete"
										cancelText="Cancel"
									>
										<Button size="small" danger icon={<DeleteOutlined />} />
									</Popconfirm>
								</Space>
							),
						},
					]}
				/>
			</Space>

			{/* Add/Edit Sub-Modal */}
			<Modal
				title={editingItem?.isNew ? "Add Birthday" : "Edit Birthday"}
				open={!!editingItem}
				onCancel={() => setEditingItem(null)}
				onOk={handleSaveForm}
				okText="Save"
			>
				<Form form={form} layout="vertical" style={{ marginTop: 16 }}>
					<Form.Item
						name="name"
						label="Name / Couple"
						rules={[{ required: true, message: "Please enter a name" }]}
					>
						<Input placeholder="e.g. John Doe" />
					</Form.Item>
					<Form.Item
						name="date"
						label="Birth / Wedding Date"
						rules={[{ required: true, message: "Please select a date" }]}
					>
						<DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
					</Form.Item>
					<Form.Item
						name="kind"
						label="Category"
						rules={[{ required: true, message: "Please select a category" }]}
					>
						<Radio.Group>
							<Radio.Button value="♂️">♂️ Boy</Radio.Button>
							<Radio.Button value="♀️">♀️ Girl</Radio.Button>
							<Radio.Button value="💒">💒 Wedding</Radio.Button>
						</Radio.Group>
					</Form.Item>
				</Form>
			</Modal>
		</Modal>
	);
};
