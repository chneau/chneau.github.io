import { notifications } from "@mantine/notifications";

/**
 * Thin wrapper over Mantine notifications so call sites read like the previous
 * `message.success("…")` API. `<Notifications />` must be mounted in App.
 */
export const notify = {
	success: (message: string) => notifications.show({ message, color: "teal" }),
	info: (message: string) => notifications.show({ message, color: "blue" }),
	warning: (message: string) =>
		notifications.show({ message, color: "yellow" }),
	error: (message: string) => notifications.show({ message, color: "red" }),
};
