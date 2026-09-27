import type { ReactNode } from "react";

/** Composed empty state with an optional icon mark and action. */
export const EmptyState = ({
	icon,
	title,
	body,
	action,
}: {
	icon?: ReactNode;
	title: string;
	body?: ReactNode;
	action?: ReactNode;
}) => (
	<div className="app-empty">
		{icon && (
			<span className="app-empty__mark" aria-hidden="true">
				{icon}
			</span>
		)}
		<h3>{title}</h3>
		{body && <p>{body}</p>}
		{action}
	</div>
);
