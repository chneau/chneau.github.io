import { Button, Dropdown, type MenuProps, message } from "antd";
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

	const calendarItems: MenuProps["items"] = [
		{
			key: "subscribe",
			label: t("app.calendar.subscribe"),
			icon: "📅",
			onClick: subscribeICS,
		},
		{
			key: "google",
			label: "Google Calendar",
			icon: "🌐",
			onClick: addToGoogleCalendar,
		},
		{
			key: "copy",
			label: t("app.calendar.copy"),
			icon: "🔗",
			onClick: () => {
				const url = getIcsUrl();
				navigator.clipboard.writeText(url);
				message.success(t("app.calendar.copied"));
			},
		},
		{
			type: "divider",
		},
		{
			key: "download",
			label: t("app.calendar.export"),
			icon: "📥",
			onClick: downloadICS,
		},
	];

	return (
		<Dropdown menu={{ items: calendarItems }}>
			<Button type="primary">📅 {t("app.calendar.export")}</Button>
		</Dropdown>
	);
};
