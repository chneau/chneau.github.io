import { Button, Group, Popover, Text } from "@mantine/core";
import {
	cloneElement,
	type MouseEvent,
	type ReactElement,
	useState,
} from "react";
import { useTranslation } from "react-i18next";

type ConfirmPopoverProps = {
	title: string;
	confirmLabel?: string;
	cancelLabel?: string;
	danger?: boolean;
	/** Controlled open state. When omitted the popover manages its own state. */
	opened?: boolean;
	onOpenChange?: (opened: boolean) => void;
	onConfirm: () => void;
	children: ReactElement<{ onClick?: (event: MouseEvent) => void }>;
};

/** A small confirm-on-click popover for destructive actions. */
export const ConfirmPopover = ({
	title,
	confirmLabel,
	cancelLabel,
	danger = false,
	opened: openedProp,
	onOpenChange,
	onConfirm,
	children,
}: ConfirmPopoverProps) => {
	const { t } = useTranslation();
	const [internalOpened, setInternalOpened] = useState(false);
	const isControlled = openedProp !== undefined;
	const opened = isControlled ? openedProp : internalOpened;

	const setOpened = (value: boolean) => {
		if (!isControlled) setInternalOpened(value);
		onOpenChange?.(value);
	};

	// The popover is controlled, so Mantine does not open it from the target
	// itself. Clone the trigger to open/close it while keeping its own handler.
	const trigger = cloneElement(children, {
		onClick: (event: MouseEvent) => {
			children.props.onClick?.(event);
			event.stopPropagation();
			setOpened(!opened);
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
						{cancelLabel ?? t("common.cancel")}
					</Button>
					<Button
						size="xs"
						color={danger ? "red" : "teal"}
						onClick={() => {
							setOpened(false);
							onConfirm();
						}}
					>
						{confirmLabel ?? t("common.confirm")}
					</Button>
				</Group>
			</Popover.Dropdown>
		</Popover>
	);
};
