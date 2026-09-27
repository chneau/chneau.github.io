import { Progress, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { TFunction } from "i18next";
import { Clock, Gem, RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import { BirthdayDetails } from "./BirthdayDetails";
import type { Birthday } from "./birthdays";
import { Highlight } from "./Highlight";
import { KindIcon, kindLabelKey } from "./KindIcon";
import { store } from "./store";

const getColumns = (search: string, t: TFunction): ColumnsType<Birthday> => [
	{
		title: t("table.name"),
		dataIndex: "name",
		render: (_, x) => (
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
		title: t("table.birthday"),
		dataIndex: "birthdayString",
		render: (_, x) => (
			<span style={{ fontFamily: "var(--tk-font-mono)", fontSize: 12 }}>
				<Highlight text={x.birthdayString} search={search} />
			</span>
		),
		sorter: (a, b) => a.birthday.getTime() - b.birthday.getTime(),
	},
	{
		title: t("table.age"),
		dataIndex: "age",
		render: (age) => <Highlight text={String(age)} search={search} />,
		sorter: (a, b) => a.age - b.age,
	},
	{
		title: t("table.progress"),
		dataIndex: "progress",
		render: (progress) => (
			<Progress percent={Math.round(progress)} size="small" showInfo={false} />
		),
		sorter: (a, b) => a.progress - b.progress,
		responsive: ["sm"],
	},
	{
		title: t("table.in"),
		dataIndex: "daysBeforeBirthday",
		render: (days) => (
			<span
				style={{
					display: "inline-flex",
					alignItems: "center",
					gap: 5,
					fontFamily: "var(--tk-font-mono)",
					fontSize: 12,
					color: days === 0 ? "var(--tk-accent-ink)" : "var(--tk-text-dim)",
				}}
			>
				<Clock size={12} strokeWidth={1.9} />
				{days} {t("table.days")}
			</span>
		),
		sorter: (a, b) => a.daysBeforeBirthday - b.daysBeforeBirthday,
	},
	{
		title: t("table.sign"),
		dataIndex: "sign",
		render: (_, x) => (
			<span style={{ whiteSpace: "nowrap" }}>
				{x.signSymbol}{" "}
				<Highlight text={t(`data.zodiac.${x.sign}`)} search={search} />
			</span>
		),
		sorter: (a, b) =>
			t(`data.zodiac.${a.sign}`).localeCompare(t(`data.zodiac.${b.sign}`)),
		responsive: ["md"],
	},
	{
		title: t("table.birthgem"),
		dataIndex: "birthgem",
		render: (_, x) => (
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
		responsive: ["lg"],
	},
	{
		title: t("table.chinese"),
		dataIndex: "chineseZodiac",
		render: (_, x) => (
			<Highlight
				text={t(`data.chinese_zodiac.${x.chineseZodiac}`)}
				search={search}
			/>
		),
		sorter: (a, b) =>
			t(`data.chinese_zodiac.${a.chineseZodiac}`).localeCompare(
				t(`data.chinese_zodiac.${b.chineseZodiac}`),
			),
		responsive: ["xl"],
	},
];

export const BirthdayTable = ({ data }: { data: readonly Birthday[] }) => {
	const { search } = useSnapshot(store);
	const { t } = useTranslation();
	const [pageSize, setPageSize] = useState(15);
	const columns = useMemo(() => getColumns(search, t), [search, t]);

	const handleResetFilters = () => {
		store.search = "";
		store.showBoys = true;
		store.showGirls = true;
		store.showWeddings = false;
	};

	return (
		<Table
			rowKey={(record) => `${record.name}-${record.birthdayString}`}
			columns={columns}
			dataSource={data as Birthday[]}
			pagination={{
				pageSize,
				onShowSizeChange: (_current, size) => setPageSize(size),
				showSizeChanger: true,
				pageSizeOptions: ["10", "15", "25", "50", "100"],
				showTotal: (total) => `${total} ${t("app.birthdays")}`,
				size: "small",
			}}
			size="small"
			locale={{
				emptyText: (
					<div className="tk-empty">
						<span className="tk-empty__mark">
							<Search size={20} strokeWidth={1.5} />
						</span>
						<h3>{t("app.list.empty_title")}</h3>
						<p>{t("app.list.empty_body")}</p>
						<button
							type="button"
							className="tk-iconbtn"
							onClick={handleResetFilters}
						>
							<RotateCcw size={14} strokeWidth={1.9} />
							{t("app.list.reset")}
						</button>
					</div>
				),
			}}
			rowClassName={(record) =>
				record.daysBeforeBirthday === 0 ? "tk-row-today" : ""
			}
			expandable={{
				expandedRowRender: (record) => <BirthdayDetails record={record} />,
			}}
		/>
	);
};
