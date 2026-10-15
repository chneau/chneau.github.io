import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";

export const ConfirmDialog = ({
	opened,
	title,
	body,
	confirmLabel,
	cancelLabel = "Cancel",
	dangerous,
	onCancel,
	onConfirm,
}: {
	opened: boolean;
	title: string;
	body: ReactNode;
	confirmLabel: string;
	cancelLabel?: string;
	dangerous: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}) => (
	<Modal opened={opened} onClose={onCancel} title={title} centered size="sm">
		<Stack gap="md">
			<Text size="sm">{body}</Text>
			<Group justify="flex-end" gap="sm">
				<Button variant="default" onClick={onCancel}>
					{cancelLabel}
				</Button>
				<Button color={dangerous ? "red" : "brand"} onClick={onConfirm}>
					{confirmLabel}
				</Button>
			</Group>
		</Stack>
	</Modal>
);
