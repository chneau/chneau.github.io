import { Menu, ScrollArea } from "@mantine/core";
import {
	CalendarDays,
	Download,
	Info,
	Link as LinkIcon,
	UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	getRawBirthdays,
	type RawBirthday,
	subscribeBirthdays,
} from "./birthdays";
import { generateIcs, type IcsRecord, icsFileName } from "./ics";
import { hostedIcsUrl, toWebcal } from "./ics-url";
import { notify } from "./notify";

export { hostedIcsUrl, toWebcal } from "./ics-url";

const downloadText = (content: string, fileName: string) => {
	const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	link.rel = "noopener";
	document.body.appendChild(link);
	link.click();
	link.remove();
	setTimeout(() => {
		URL.revokeObjectURL(url);
	}, 0);
};

const buildIcs = (
	records: readonly RawBirthday[],
	summary: (record: IcsRecord) => string,
	calendarName: string,
): string =>
	generateIcs(records, {
		summary,
		calendarName,
		now: new Date(),
	});

export const CalendarActions = () => {
	const { t } = useTranslation();

	const [records, setRecords] = useState<readonly RawBirthday[]>(() =>
		getRawBirthdays(),
	);
	useEffect(() => {
		const unsubscribe = subscribeBirthdays(() => setRecords(getRawBirthdays()));
		return () => {
			unsubscribe();
		};
	}, []);

	const summaryFor = (record: IcsRecord): string =>
		record.kind === "💒"
			? t("app.calendar.ics_wedding", { name: record.name })
			: t("app.calendar.ics_birthday", { name: record.name });

	const downloadAll = () => {
		downloadText(
			buildIcs(records, summaryFor, t("app.calendar.calendar_name")),
			"birthdays.ics",
		);
		notify.success(t("app.calendar.exported"));
	};

	const downloadOne = (record: RawBirthday) => {
		downloadText(
			buildIcs([record], summaryFor, record.name),
			icsFileName(record.name),
		);
		notify.success(t("app.calendar.exported_one", { name: record.name }));
	};

	const subscribeICS = () => {
		window.location.assign(toWebcal(hostedIcsUrl(window.location.origin)));
	};

	const addToGoogleCalendar = () => {
		const googleUrl = `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(
			hostedIcsUrl(window.location.origin),
		)}`;
		if (window.open(googleUrl, "_blank", "noopener") === null) {
			notify.warning(t("app.calendar.google_blocked"));
		}
	};

	type MenuEntry =
		| { readonly type: "divider" }
		| {
				readonly key: string;
				readonly label: string;
				readonly icon: React.ReactNode;
				readonly onClick: () => void;
		  };

	const calendarItems: MenuEntry[] = [
		{
			key: "download",
			label: t("app.calendar.export"),
			icon: <Download size={14} />,
			onClick: downloadAll,
		},
		{
			key: "one",
			label: t("app.calendar.export_one"),
			icon: <UserRound size={14} />,
			onClick: () => undefined,
		},
		{ type: "divider" },
		{
			key: "subscribe",
			label: t("app.calendar.subscribe"),
			icon: <CalendarDays size={14} />,
			onClick: subscribeICS,
		},
		{
			key: "google",
			label: "Google Calendar",
			icon: <CalendarDays size={14} />,
			onClick: addToGoogleCalendar,
		},
		{
			key: "copy",
			label: t("app.calendar.copy"),
			icon: <LinkIcon size={14} />,
			onClick: async () => {
				try {
					await navigator.clipboard.writeText(
						hostedIcsUrl(window.location.origin),
					);
					notify.success(t("app.calendar.copied"));
				} catch {
					notify.error(t("app.calendar.copy_failed"));
				}
			},
		},
	];

	return (
		<Menu position="bottom-end" shadow="md" withinPortal>
			<Menu.Target>
				<button type="button" className="tk-iconbtn">
					<CalendarDays size={15} strokeWidth={1.9} />
					<span className="tk-iconbtn__label">{t("app.calendar.export")}</span>
				</button>
			</Menu.Target>
			<Menu.Dropdown>
				{calendarItems.map((item) =>
					"type" in item ? (
						<Menu.Divider key="calendar-divider" />
					) : item.key === "one" ? (
						<PerPersonExport
							key={item.key}
							label={item.label}
							icon={item.icon}
							records={records}
							onExport={downloadOne}
						/>
					) : (
						<Menu.Item
							key={item.key}
							leftSection={item.icon}
							onClick={item.onClick}
						>
							{item.label}
						</Menu.Item>
					),
				)}
				<Menu.Divider />
				<Menu.Item
					leftSection={<Info size={14} />}
					closeMenuOnClick={false}
					component="div"
					style={{ pointerEvents: "none", whiteSpace: "normal" }}
				>
					{t("app.calendar.hosted_hint")}
				</Menu.Item>
			</Menu.Dropdown>
		</Menu>
	);
};

const PerPersonExport = ({
	label,
	icon,
	records,
	onExport,
}: {
	readonly label: string;
	readonly icon: React.ReactNode;
	readonly records: readonly RawBirthday[];
	readonly onExport: (record: RawBirthday) => void;
}) => {
	const [opened, setOpened] = useState(false);

	return (
		<Menu.Sub position="right-start" opened={opened} onChange={setOpened}>
			<Menu.Sub.Target>
				<Menu.Item leftSection={icon}>{label}</Menu.Item>
			</Menu.Sub.Target>
			<Menu.Sub.Dropdown>
				<ScrollArea.Autosize mah={280}>
					{records.map((record) => (
						<Menu.Item
							key={`${record.name}-${record.date}`}
							onClick={() => {
								onExport(record);
							}}
						>
							{record.name}
						</Menu.Item>
					))}
				</ScrollArea.Autosize>
			</Menu.Sub.Dropdown>
		</Menu.Sub>
	);
};
