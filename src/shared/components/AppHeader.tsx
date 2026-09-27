import type { ReactNode } from "react";

type AppHeaderProps = {
	brand: ReactNode;
	center?: ReactNode;
	actions?: ReactNode;
	/** Drop sticky positioning when the header sits inside a fixed layout. */
	staticPosition?: boolean;
	className?: string;
};

/** The one shared top bar. Brand left, optional centre, actions right. */
export const AppHeader = ({
	brand,
	center,
	actions,
	staticPosition,
	className,
}: AppHeaderProps) => (
	<header
		className={[
			"app-header",
			staticPosition ? "app-header--static" : undefined,
			className,
		]
			.filter(Boolean)
			.join(" ")}
	>
		{brand}
		<div className="app-header__center">{center}</div>
		{actions ? <div className="app-header__actions">{actions}</div> : null}
	</header>
);
