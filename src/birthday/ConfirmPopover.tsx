import { Button, Group, Popover, Text } from "@mantine/core";
import {
	cloneElement,
	type MouseEvent,
	type ReactElement,
	useState,
} from "react";

type ConfirmPopoverProps = {
	title: string;
	confirmLabel?: string;
	cancelLabel?: string;
	danger?: boolean;
	onConfirm: () => void;
	children: ReactElement<{ onClick?: (event: MouseEvent) => void }>;
};

/** A small confirm-on-click popover for destructive actions. */
export const ConfirmPopover = ({
	title,
	confirmLabel = "Confirm",
	cancelLabel = "Cancel",
	danger = false,
	onConfirm,
	children,
}: ConfirmPopoverProps) => {
	const [opened, setOpened] = useState(false);

	// The popover is controlled, so Mantine does not open it from the target
	// itself. Clone the trigger to open/close it while keeping its own handler.
	const trigger = cloneElement(children, {
		onClick: (event: MouseEvent) => {
			children.props.onClick?.(event);
			event.stopPropagation();
			setOpened((value) => !value);
		},
	});

	return (
		<Popover
			opened={opened}
			onChange={setOpened}
			position="top"
			withArrow
			shadow="md"
			withinPortal
		>
			<Popover.Target>{trigger}</Popover.Target>
			<Popover.Dropdown>
				<Text size="sm" mb="xs" maw={240}>
					{title}
				</Text>
				<Group justify="flex-end" gap="xs">
					<Button size="xs" variant="default" onClick={() => setOpened(false)}>
						{cancelLabel}
					</Button>
					<Button
						size="xs"
						color={danger ? "red" : "teal"}
						onClick={() => {
							setOpened(false);
							onConfirm();
						}}
					>
						{confirmLabel}
					</Button>
				</Group>
			</Popover.Dropdown>
		</Popover>
	);
};
