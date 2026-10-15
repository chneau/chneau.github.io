import type { ReactNode } from "react";

type AppHeaderProps = {
	brand: ReactNode;
	center?: ReactNode;
	actions?: ReactNode;
	staticPosition?: boolean;
	className?: string;
};

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
