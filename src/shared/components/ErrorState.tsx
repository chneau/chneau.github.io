import type { CSSProperties, ReactNode } from "react";
import { EmptyState } from "./EmptyState";

export const ErrorState = ({
	title,
	body,
	action,
	label,
	className,
	style,
}: {
	title: string;
	body?: ReactNode;
	action?: ReactNode;
	label?: ReactNode;
	className?: string;
	style?: CSSProperties;
}) => (
	<div className={className} style={style} role="alert">
		{label}
		<EmptyState title={title} body={body} action={action} />
	</div>
);
