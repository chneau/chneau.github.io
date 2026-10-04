import { Footer } from "../shared";

declare const BUILD_DATE: string;

type DashboardFooterProps = {
	/** Current year, from the dashboard clock. */
	year: number;
	analyticsOn: boolean;
	onToggleAnalytics: () => void;
};

/** Copyright line plus the analytics consent toggle. */
export const DashboardFooter = ({
	year,
	analyticsOn,
	onToggleAnalytics,
}: DashboardFooterProps) => (
	<Footer
		left={`chneau © ${year}`}
		right={
			<>
				{/* Stable accessible name plus `aria-pressed`: the visible
				    state word changes, so putting it in the name too would
				    make the button announce as two different buttons. */}
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
