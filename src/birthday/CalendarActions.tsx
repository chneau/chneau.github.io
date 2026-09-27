import { Dropdown, message } from "antd";
import { CalendarDays, Download, Link as LinkIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

const getIcsUrl = () => {
	const base = `${window.location.origin}${window.location.pathname}`.replace(
		/\/+$/,
		"",
	);
	return `${base}/birthdays.ics`;
};

const downloadICS = () => {
	const link = document.createElement("a");
	link.href = getIcsUrl();
	link.download = "birthdays.ics";
	link.click();
};

const subscribeICS = () => {
	const url = `${window.location.host}${window.location.pathname}`.replace(
		/\/+$/,
		"",
	);
	window.location.assign(`webcal://${url}/birthdays.ics`);
};

const addToGoogleCalendar = () => {
	const url = getIcsUrl();
	const googleUrl = `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(
		url,
	)}`;
	window.open(googleUrl, "_blank");
};

export const CalendarActions = () => {
	const { t } = useTranslation();

	const calendarItems = [
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
			onClick: () => {
				const url = getIcsUrl();
				navigator.clipboard.writeText(url);
				message.success(t("app.calendar.copied"));
			},
		},
		{ type: "divider" as const },
		{
			key: "download",
			label: t("app.calendar.export"),
			icon: <Download size={14} />,
			onClick: downloadICS,
		},
	];

	return (
		<Dropdown menu={{ items: calendarItems }}>
			<button type="button" className="tk-iconbtn">
				<CalendarDays size={15} strokeWidth={1.9} />
				<span className="tk-iconbtn__label">{t("app.calendar.export")}</span>
			</button>
		</Dropdown>
	);
};
