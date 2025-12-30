import { Button, Dropdown, type MenuProps, message } from "antd";

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

const calendarItems: MenuProps["items"] = [
	{
		key: "subscribe",
		label: "Subscribe to Calendar (webcal)",
		icon: "📅",
		onClick: subscribeICS,
	},
	{
		key: "google",
		label: "Add to Google Calendar",
		icon: "🌐",
		onClick: addToGoogleCalendar,
	},
	{
		key: "copy",
		label: "Copy ICS Link",
		icon: "🔗",
		onClick: () => {
			const url = `${window.location.origin}/birthdays.ics`;
			navigator.clipboard.writeText(url);
			message.success("ICS link copied to clipboard!");
		},
	},
	{
		type: "divider",
	},
	{
		key: "download",
		label: "Download ICS File",
		icon: "📥",
		onClick: downloadICS,
	},
];

export const CalendarActions = () => {
	return (
		<Dropdown menu={{ items: calendarItems }}>
			<Button type="primary">📅 Calendar Actions</Button>
		</Dropdown>
	);
};
