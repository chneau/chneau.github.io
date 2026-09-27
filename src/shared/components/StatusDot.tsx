/** A small breathing status light. */
export const StatusDot = ({
	on = true,
	label,
}: {
	on?: boolean;
	label?: string;
}) => {
	const className = `app-statusdot${
		on ? " app-statusdot--on" : " app-statusdot--off"
	}`;
	return label ? (
		<span className={className} role="img" aria-label={label} />
	) : (
		<span className={className} aria-hidden="true" />
	);
};
