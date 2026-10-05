import {
	Group,
	Pagination,
	Progress,
	Select,
	Table,
	Text,
	UnstyledButton,
} from "@mantine/core";
import type { TFunction } from "i18next";
import {
	ArrowDown,
	ArrowUp,
	ChevronDown,
	ChevronRight,
	Clock,
	Gem,
	RotateCcw,
	Search,
} from "lucide-react";
import { Fragment, type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import { EmptyState } from "../shared";
import { BirthdayDetails } from "./BirthdayDetails";
import type { Birthday } from "./birthdays";
import { Highlight } from "./Highlight";
import { KindIcon, kindLabelKey } from "./KindIcon";
import { withRowKeys } from "./row-keys";
import { resetFilters, store } from "./store";

type SortKey =
	| "name"
	| "birthday"
	| "age"
	| "progress"
	| "daysBeforeBirthday"
	| "sign"
	| "birthgem"
	| "chineseZodiac";

type SortDir = "asc" | "desc";

type Visibility = "sm" | "md" | "lg" | "xl";

type ColumnDef = {
	key: SortKey;
	title: string;
	visibleFrom?: Visibility;
	render: (record: Birthday) => ReactNode;
	sorter: (a: Birthday, b: Birthday) => number;
};

const PAGE_SIZE_OPTIONS = [10, 15, 25, 50, 100];

// Re-exported for the existing importers; the key derivation lives in
// `row-keys.ts` so the table and the countdown provably share one rule.
export { withRowKeys } from "./row-keys";

const getColumns = (search: string, t: TFunction): ColumnDef[] => [
	{
		key: "name",
		title: t("table.name"),
		render: (x) => (
			<>
				<span
					style={{
						display: "inline-flex",
						alignItems: "center",
						gap: 6,
						fontWeight: 500,
					}}
				>
					<KindIcon kind={x.kind} size={13} />
					<Highlight text={x.name} search={search} />
					<span
						style={{
							fontSize: 10,
							letterSpacing: "0.08em",
							textTransform: "uppercase",
							color: "var(--tk-text-faint)",
						}}
					>
						{t(kindLabelKey(x.kind))}
					</span>
				</span>
				{x.milestone && (
					<span
						style={{
							marginLeft: 8,
							fontSize: 11,
							color: "var(--tk-accent-ink)",
							border: "1px solid var(--tk-accent-line)",
							background: "var(--tk-accent-soft)",
							borderRadius: 999,
							padding: "1px 8px",
						}}
					>
						{t(x.milestone.key, x.milestone.params)}
					</span>
				)}
			</>
		),
		sorter: (a, b) => a.name.localeCompare(b.name),
	},
	{
		key: "birthday",
		title: t("table.birthday"),
		render: (x) => (
			<span style={{ fontFamily: "var(--tk-font-mono)", fontSize: 12 }}>
				<Highlight text={x.birthdayString} search={search} />
			</span>
		),
		sorter: (a, b) => a.birthday.getTime() - b.birthday.getTime(),
	},
	{
		key: "age",
		title: t("table.age"),
		render: (x) => <Highlight text={String(x.age)} search={search} />,
		sorter: (a, b) => a.age - b.age,
	},
	{
		key: "progress",
		title: t("table.progress"),
		render: (x) => <Progress value={Math.round(x.progress)} size="sm" />,
		sorter: (a, b) => a.progress - b.progress,
		visibleFrom: "sm",
	},
	{
		key: "daysBeforeBirthday",
		title: t("table.in"),
		render: (x) => (
			<span
				style={{
					display: "inline-flex",
					alignItems: "center",
					gap: 5,
					fontFamily: "var(--tk-font-mono)",
					fontSize: 12,
					color:
						x.daysBeforeBirthday === 0
							? "var(--tk-accent-ink)"
							: "var(--tk-text-dim)",
				}}
			>
				<Clock size={12} strokeWidth={1.9} />
				{x.daysBeforeBirthday} {t("table.days")}
			</span>
		),
		sorter: (a, b) => a.daysBeforeBirthday - b.daysBeforeBirthday,
	},
	{
		key: "sign",
		title: t("table.sign"),
		render: (x) => (
			<span style={{ whiteSpace: "nowrap" }}>
				{x.signSymbol}{" "}
				<Highlight text={t(`data.zodiac.${x.sign}`)} search={search} />
			</span>
		),
		sorter: (a, b) =>
			t(`data.zodiac.${a.sign}`).localeCompare(t(`data.zodiac.${b.sign}`)),
		visibleFrom: "md",
	},
	{
		key: "birthgem",
		title: t("table.birthgem"),
		render: (x) => (
			<span
				style={{
					display: "inline-flex",
					alignItems: "center",
					gap: 5,
					whiteSpace: "nowrap",
				}}
			>
				<Gem size={12} strokeWidth={1.9} color="var(--tk-text-faint)" />
				<Highlight
					text={`${t(`data.birthgems.${x.birthgem}`)} · ${t(
						`data.months.${x.monthName}`,
					)}`}
					search={search}
				/>
			</span>
		),
		sorter: (a, b) => a.birthgem.localeCompare(b.birthgem),
		visibleFrom: "lg",
	},
	{
		key: "chineseZodiac",
		title: t("table.chinese"),
		render: (x) => (
			<Highlight
				text={t(`data.chinese_zodiac.${x.chineseZodiac}`)}
				search={search}
			/>
		),
		sorter: (a, b) =>
			t(`data.chinese_zodiac.${a.chineseZodiac}`).localeCompare(
				t(`data.chinese_zodiac.${b.chineseZodiac}`),
			),
		visibleFrom: "xl",
	},
];

export const BirthdayTable = ({ data }: { data: readonly Birthday[] }) => {
	const { search } = useSnapshot(store);
	const { t } = useTranslation();
	const [pageSize, setPageSize] = useState(15);
	const [page, setPage] = useState(1);
	const [sortKey, setSortKey] = useState<SortKey | null>(null);
	const [sortDir, setSortDir] = useState<SortDir>("asc");
	const [expandedKey, setExpandedKey] = useState<string | null>(null);
	const columns = useMemo(() => getColumns(search, t), [search, t]);

	const handleResetFilters = () => {
		resetFilters();
	};

	const toggleSort = (key: SortKey) => {
		if (sortKey === key) {
			setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
		} else {
			setSortKey(key);
			setSortDir("asc");
		}
	};

	// Keys are assigned in `data` order, before sorting, so a record keeps the
	// same key — and the same expanded state — whatever the user sorts by.
	const keyed = useMemo(() => withRowKeys(data), [data]);

	const sorted = useMemo(() => {
		if (!sortKey) return keyed;
		const column = columns.find((candidate) => candidate.key === sortKey);
		if (!column) return keyed;
		const next = [...keyed].sort((a, b) => column.sorter(a.record, b.record));
		return sortDir === "asc" ? next : next.reverse();
	}, [keyed, columns, sortKey, sortDir]);

	const total = sorted.length;
	const pageCount = Math.max(1, Math.ceil(total / pageSize));
	const currentPage = Math.min(page, pageCount);
	const start = (currentPage - 1) * pageSize;
	const pageRows = sorted.slice(start, start + pageSize);

	if (total === 0) {
		return (
			<EmptyState
				icon={<Search size={20} strokeWidth={1.5} />}
				title={t("app.list.empty_title")}
				body={t("app.list.empty_body")}
				action={
					<button
						type="button"
						className="tk-iconbtn"
						onClick={handleResetFilters}
					>
						<RotateCcw size={14} strokeWidth={1.9} />
						{t("app.list.reset")}
					</button>
				}
			/>
		);
	}

	return (
		<>
			<Table.ScrollContainer
				minWidth={520}
				type="native"
				style={{ overflowX: "auto" }}
			>
				<Table className="tk-table" highlightOnHover verticalSpacing="sm">
					<Table.Thead>
						<Table.Tr>
							<Table.Th style={{ width: 32 }} />
							{columns.map((column) => (
								<Table.Th
									key={column.key}
									visibleFrom={column.visibleFrom}
									aria-sort={
										sortKey === column.key
											? sortDir === "asc"
												? "ascending"
												: "descending"
											: "none"
									}
								>
									<button
										type="button"
										onClick={() => toggleSort(column.key)}
										style={{
											display: "inline-flex",
											alignItems: "center",
											gap: 4,
											background: "none",
											border: "none",
											padding: 0,
											margin: 0,
											font: "inherit",
											color: "inherit",
											cursor: "pointer",
											userSelect: "none",
											textAlign: "left",
										}}
									>
										{column.title}
										{sortKey === column.key &&
											(sortDir === "asc" ? (
												<ArrowUp size={12} />
											) : (
												<ArrowDown size={12} />
											))}
									</button>
								</Table.Th>
							))}
						</Table.Tr>
					</Table.Thead>
					<Table.Tbody>
						{pageRows.map(({ record, key: rowKey }) => {
							// A collision-free key means two rows that happen to share
							// name and date can no longer drive each other's panel.
							const expanded = expandedKey === rowKey;
							return (
								<Fragment key={rowKey}>
									<Table.Tr
										className={
											record.daysBeforeBirthday === 0
												? "tk-row-today"
												: undefined
										}
									>
										<Table.Td>
											<UnstyledButton
												onClick={() => setExpandedKey(expanded ? null : rowKey)}
												aria-label={
													expanded ? "Collapse details" : "Expand details"
												}
												aria-expanded={expanded}
											>
												{expanded ? (
													<ChevronDown size={14} />
												) : (
													<ChevronRight size={14} />
												)}
											</UnstyledButton>
										</Table.Td>
										{columns.map((column) => (
											<Table.Td
												key={column.key}
												visibleFrom={column.visibleFrom}
											>
												{column.render(record)}
											</Table.Td>
										))}
									</Table.Tr>
									{expanded && (
										<Table.Tr className="tk-expanded-row">
											<Table.Td colSpan={columns.length + 1}>
												<BirthdayDetails record={record} />
											</Table.Td>
										</Table.Tr>
									)}
								</Fragment>
							);
						})}
					</Table.Tbody>
				</Table>
			</Table.ScrollContainer>

			<Group justify="space-between" mt="md">
				<Text size="xs" c="dimmed">
					{total} {t("app.birthdays")}
				</Text>
				<Group gap="sm">
					<Select
						size="xs"
						w={80}
						allowDeselect={false}
						aria-label={t("table.rows_per_page")}
						value={String(pageSize)}
						data={PAGE_SIZE_OPTIONS.map((size) => ({
							value: String(size),
							label: String(size),
						}))}
						onChange={(value) => {
							if (!value) return;
							setPageSize(Number(value));
							setPage(1);
						}}
					/>
					<Pagination
						size="sm"
						total={pageCount}
						value={currentPage}
						onChange={setPage}
					/>
				</Group>
			</Group>
		</>
	);
};
