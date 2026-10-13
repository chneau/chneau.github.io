import type { CSSProperties, ReactNode } from "react";
import { EmptyState } from "./EmptyState";

/**
 * The one failure state the site announces.
 *
 * `role="alert"` makes the text an assertive announcement, so this must only be
 * mounted once a failure is real — an error that may resolve is a
 * `LoadingState` until it does. `EmptyState` carries the visual shape, so an
 * error and an empty result read as the same kind of panel.
 */
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
	/** The recovery: a retry, a link, anything the reader can act on. */
	action?: ReactNode;
	/**
	 * A heading the page still needs when it renders nothing else — the visual
	 * heading is `title`, so pass an `sr-only` copy of the page's name to keep
	 * the document outline intact while the alert stays a single sentence.
	 */
	label?: ReactNode;
	className?: string;
	style?: CSSProperties;
}) => (
	<div className={className} style={style} role="alert">
		{label}
		<EmptyState title={title} body={body} action={action} />
	</div>
);
