import {
	Box,
	Card,
	Collapse,
	Group,
	Text,
	UnstyledButton,
} from "@mantine/core";
import { ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";

type Props = {
	title: string;
	badge?: ReactNode;
	actions?: ReactNode;
	defaultOpen?: boolean;
	children: ReactNode;
};

/** A sidebar card with a clickable header that collapses its body. */
export const Section = ({
	title,
	badge,
	actions,
	defaultOpen = true,
	children,
}: Props) => {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<Card withBorder padding="sm" radius="md">
			<Group justify="space-between" gap="xs" wrap="nowrap">
				<UnstyledButton
					onClick={() => setOpen((value) => !value)}
					aria-expanded={open}
					style={{ flex: 1, minWidth: 0 }}
				>
					<Group gap={6} wrap="nowrap">
						<ChevronDown
							size={14}
							style={{
								transform: open ? undefined : "rotate(-90deg)",
								transition: "transform 150ms",
								flexShrink: 0,
							}}
						/>
						<Text size="xs" fw={700} tt="uppercase" c="dimmed" lineClamp={1}>
							{title}
						</Text>
						{badge}
					</Group>
				</UnstyledButton>
				{actions}
			</Group>
			<Collapse expanded={open}>
				<Box pt="xs">{children}</Box>
			</Collapse>
		</Card>
	);
};
