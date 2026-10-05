import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";

/**
 * A yes/no dialog with a destructive action on the right.
 *
 * The editor has two of them — discard every staged change, and replace the
 * open save — and they were written out separately. They are the same dialog
 * with different words, and keeping the pair in step matters: a reader who has
 * learned one has learned where "Cancel" and the dangerous button are.
 */
export const ConfirmModal = ({
	opened,
	title,
	body,
	confirmLabel,
	cancelLabel = "Cancel",
	/** Red for an action that throws work away. */
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
