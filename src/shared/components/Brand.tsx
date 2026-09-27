import type { MouseEvent, ReactNode } from "react";

type BrandProps = {
	icon?: ReactNode;
	title: ReactNode;
	subtitle?: ReactNode;
	href?: string;
	onClick?: (event: MouseEvent) => void;
};

/** Consistent brand block: accent mark, title and an optional subtitle. */
export const Brand = ({ icon, title, subtitle, href, onClick }: BrandProps) => {
	const inner = (
		<>
			{icon ? <span className="app-brand__mark">{icon}</span> : null}
			<span className="app-brand__text">
				<span className="app-brand__title">{title}</span>
				{subtitle ? (
					<span className="app-brand__subtitle">{subtitle}</span>
				) : null}
			</span>
		</>
	);

	if (href) {
		return (
			<a className="app-brand" href={href} onClick={onClick}>
				{inner}
			</a>
		);
	}
	return <span className="app-brand">{inner}</span>;
};
