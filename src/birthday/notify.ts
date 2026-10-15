import { notifications } from "@mantine/notifications";

export const notify = {
	success: (message: string) => notifications.show({ message, color: "teal" }),
	info: (message: string) => notifications.show({ message, color: "blue" }),
	warning: (message: string) =>
		notifications.show({ message, color: "yellow" }),
	error: (message: string) => notifications.show({ message, color: "red" }),
};
