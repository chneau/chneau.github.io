import { Text } from "@mantine/core";
import type { CSSProperties, ReactNode } from "react";

export const LoadingState = ({
	label,
	children,
	className,
	style,
	hideLabel = false,
}: {
	label: string;
	children?: ReactNode;
	className?: string;
	style?: CSSProperties;
	hideLabel?: boolean;
}) => (
	<div
		className={className}
		style={style}
		role="status"
		aria-live="polite"
		aria-busy="true"
	>
		{children}
		<Text c="dimmed" className={hideLabel ? "sr-only" : undefined}>
			{label}
		</Text>
	</div>
);
