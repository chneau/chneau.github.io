import { Footer } from "../shared";

declare const BUILD_DATE: string;

type DashboardFooterProps = {
	year: number;
	analyticsOn: boolean;
	onToggleAnalytics: () => void;
};

export const DashboardFooter = ({
	year,
	analyticsOn,
	onToggleAnalytics,
}: DashboardFooterProps) => (
	<Footer
		left={`chneau © ${year}`}
		right={
			<>
				<button
					type="button"
					className="app-footer__consent"
					aria-pressed={analyticsOn}
					title={
						analyticsOn
							? "Anonymous usage analytics are on. Activate to turn them off."
							: "Analytics are off. Activate to allow anonymous usage analytics."
					}
					onClick={onToggleAnalytics}
				>
					Analytics {analyticsOn ? "on" : "off"}
				</button>
				<span>Built {BUILD_DATE}</span>
			</>
		}
	/>
);
