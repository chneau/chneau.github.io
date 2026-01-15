import { Progress, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { TFunction } from "i18next";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import { type Birthday, getAgeEmoji, getKindColor } from "./birthdays";
import { Highlight } from "./Highlight";
import { store } from "./store";
import { BirthdayDetails } from "./table/BirthdayDetails";

const getColumns = (search: string, t: TFunction): ColumnsType<Birthday> => [
	{
		title: t("table.name"),
		dataIndex: "name",
		render: (_, x) => (
			<>
				<Tag color={getKindColor(x.kind)}>
					<Highlight text={x.name} search={search} /> {x.kind}
				</Tag>
				{x.milestone && (
					<Tag color="gold" style={{ marginLeft: 4 }}>
						{t(x.milestone.key, x.milestone.params)}
					</Tag>
				)}
			</>
		),
		sorter: (a, b) => a.name.localeCompare(b.name),
	},
	{
		title: t("table.birthday"),
		dataIndex: "birthdayString",
		render: (_, x) => (
			<>
				📅 <Highlight text={x.birthdayString} search={search} />
			</>
		),
		sorter: (a, b) => a.birthday.getTime() - b.birthday.getTime(),
	},
	{
		title: t("table.age"),
		dataIndex: "age",
		render: (age, x) => (
			<Highlight text={`${age} ${getAgeEmoji(age, x.kind)}`} search={search} />
		),
		sorter: (a, b) => a.age - b.age,
	},
	{
		title: t("table.progress"),
		dataIndex: "progress",
		render: (progress) => (
			<Progress
				percent={Math.round(progress)}
				size="small"
				status={progress === 100 ? "success" : "active"}
				strokeColor={progress > 90 ? "#f5222d" : undefined}
			/>
		),
		sorter: (a, b) => a.progress - b.progress,
		responsive: ["sm"],
	},
	{
		title: t("table.in"),
		dataIndex: "daysBeforeBirthday",
		render: (days) => (
			<Tag color={days === 0 ? "red" : days < 30 ? "orange" : undefined}>
				⏳ {days} {t("table.days")}
			</Tag>
		),
		sorter: (a, b) => a.daysBeforeBirthday - b.daysBeforeBirthday,
	},
	{
		title: t("table.sign"),
		dataIndex: "sign",
		render: (_, x) => (
			<Tag>
				{x.signSymbol}{" "}
				<Highlight text={t(`data.zodiac.${x.sign}`)} search={search} />
			</Tag>
		),
		sorter: (a, b) =>
			t(`data.zodiac.${a.sign}`).localeCompare(t(`data.zodiac.${b.sign}`)),
		responsive: ["md"],
	},
	{
		title: t("table.birthgem"),
		dataIndex: "birthgem",
		render: (_, x) => {
			const month = t(`data.months.${x.monthName}`);
			const gem = t(`data.birthgems.${x.birthgem}`);
			return (
				<Tag color="blue">
					<Highlight
						text={`${gem} ${x.birthgemEmoji} (${month})`}
						search={search}
					/>
				</Tag>
			);
		},
		sorter: (a, b) => a.birthgem.localeCompare(b.birthgem),
		responsive: ["lg"],
	},
	{
		title: t("table.chinese"),
		dataIndex: "chineseZodiac",
		render: (_, x) => (
			<Tag>
				<Highlight
					text={t(`data.chinese_zodiac.${x.chineseZodiac}`)}
					search={search}
				/>
			</Tag>
		),
		sorter: (a, b) =>
			t(`data.chinese_zodiac.${a.chineseZodiac}`).localeCompare(
				t(`data.chinese_zodiac.${b.chineseZodiac}`),
			),
		responsive: ["xl"],
	},
];

export const BirthdayTable = ({ data }: { data: readonly Birthday[] }) => {
	const dataSource = useMemo(
		() => data.map((x, i) => ({ ...x, key: i })),
		[data],
	);
	const { search } = useSnapshot(store);
	const { t } = useTranslation();
	const columns = useMemo(() => getColumns(search, t), [search, t]);

	return (
		<Table
			columns={columns}
			dataSource={dataSource}
			pagination={false}
			size="small"
			scroll={{ y: 500 }}
			rowClassName={(record) =>
				record.daysBeforeBirthday === 0 ? "birthday-today-row" : ""
			}
			expandable={{
				expandedRowRender: (record) => <BirthdayDetails record={record} />,
			}}
		/>
	);
};
