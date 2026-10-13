import { Text } from "@mantine/core";
import type { CSSProperties, ReactNode } from "react";

/**
 * The one loading state the site announces.
 *
 * Three apps hand-rolled the same three lines — a live region, a busy flag and
 * a label — and each one chose differently: spooners centred a full-viewport
 * stack, birthday labelled a surface that had no visible text at all, and the
 * save landing drew the flag on the drop target with no region around it. A
 * shared contract has to serve all three, so the pieces are props: `children`
 * for the placeholders, `label` for what a screen reader hears and a sighted
 * visitor reads, and `hideLabel` for the surfaces where a visible caption would
 * be a visual change rather than an improvement.
 *
 * `role="status"` already implies `aria-live="polite"`, and both are set
 * anyway: the attribute is what the announcement actually is, and a reader
 * that ignores the implicit value still honours the explicit one.
 */
export const LoadingState = ({
	label,
	children,
	className,
	style,
	hideLabel = false,
}: {
	/** What is being waited for. Always rendered, so it is never a name only. */
	label: string;
	/** Placeholders — normally `Skeleton`s — shown above the label. */
	children?: ReactNode;
	className?: string;
	style?: CSSProperties;
	/**
	 * Keep the label for assistive technology only. Use it where the surface's
	 * design has no room for a caption, so the state announces itself without
	 * moving anything on the page.
	 */
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
