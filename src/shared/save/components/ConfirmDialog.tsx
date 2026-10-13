import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";

/**
 * A yes/no dialog with a destructive action on the right.
 *
 * The shared workbench has two of them — clear every staged change, and leave
 * the open save — and both throw work away, so both are marked dangerous.
 * The wording of the callers mirrors the Crimson Desert editor's
 * `save-overlays.tsx` dialogs on purpose: a reader who has learned where
 * "Cancel" and the red button are in one save editor has learned it in all of
 * them.
 */
export const ConfirmDialog = ({
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
