import type { ReactNode } from "react";

type FooterProps = {
	left: ReactNode;
	right?: ReactNode;
	className?: string;
};

/** Shared page footer for the document-style apps (dashboard, CV, birthday). */
export const Footer = ({ left, right, className }: FooterProps) => (
	<footer className={["app-footer", className].filter(Boolean).join(" ")}>
		<div className="app-footer__inner">
			<span className="app-footer__left">{left}</span>
			{right ? <span className="app-footer__right">{right}</span> : null}
		</div>
	</footer>
);
