import type { ReactNode } from "react";

type StatProps = {
	label: ReactNode;
	value: ReactNode;
	icon?: ReactNode;
	hint?: ReactNode;
	onClick?: () => void;
};

/** A label/value stat block. Renders as a button when `onClick` is given. */
export const Stat = ({ label, value, icon, hint, onClick }: StatProps) => {
	const body = (
		<>
			<span className="app-stat__label">
				{icon}
				{label}
			</span>
			<span className="app-stat__value">{value}</span>
			{hint ? <span className="app-stat__hint">{hint}</span> : null}
		</>
	);
	if (onClick) {
		return (
			<button
				type="button"
				className="app-stat app-stat--action"
				onClick={onClick}
			>
				{body}
			</button>
		);
	}
	return <span className="app-stat">{body}</span>;
};
