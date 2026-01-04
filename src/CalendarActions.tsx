import { Button, Dropdown, type MenuProps, message } from "antd";
import { useTranslation } from "react-i18next";

const downloadICS = () => {
	const filename = "birthdays.ics";
	const url = "/birthdays.ics";

	const link = document.createElement("a");
	link.href = url;
	link.setAttribute("download", filename);
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
};

const subscribeICS = () => {
	const url =
		`${window.location.host}${window.location.pathname}/birthdays.ics`.replace(
			/\/+/g,
			"/",
		);
	window.location.assign(`webcal://${url}`);
};

const addToGoogleCalendar = () => {
	const url = `${window.location.origin}/birthdays.ics`;
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
				const url = `${window.location.origin}/birthdays.ics`;
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
