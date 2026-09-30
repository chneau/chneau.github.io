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
import "./Section.css";

type SectionProps = {
	title: string;
	badge?: ReactNode;
	actions?: ReactNode;
	defaultOpen?: boolean;
	children: ReactNode;
};

/** A card with a clickable header that collapses its body. */
export const Section = ({
	title,
	badge,
	actions,
	defaultOpen = true,
	children,
}: SectionProps) => {
	const [open, setOpen] = useState(defaultOpen);
	return (
		// `radius` is left to the shared Card default in `theme.ts`; only the
		// padding is local, because a collapsed section is deliberately denser
		// than a standalone card.
		<Card withBorder padding="sm">
			<Group justify="space-between" gap="xs" wrap="nowrap">
				<UnstyledButton
					onClick={() => setOpen((value) => !value)}
					aria-expanded={open}
					style={{ flex: 1, minWidth: 0 }}
				>
					<Group gap={6} wrap="nowrap">
						{/*
						 * The rotation is state, so it stays inline; the *duration* must
						 * not. An inline `transition` outranks every author rule,
						 * including the global `prefers-reduced-motion` reset in
						 * `base.css`, so the chevron would keep spinning for users who
						 * asked for it to stop. `app-section__chevron` carries the
						 * transition in the stylesheet, where a reduced-motion override
						 * can actually reach it; without the class this is an instant
						 * flip, which is the safe way to fail.
						 */}
						<ChevronDown
							size={14}
							aria-hidden
							className="app-section__chevron"
							style={{
								transform: open ? undefined : "rotate(-90deg)",
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
