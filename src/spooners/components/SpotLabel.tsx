import { SPOT_META } from "../derive";
import type { VenueSpot } from "../types";

export const SpotIcon = ({
	spot,
	size = 12,
}: {
	spot: VenueSpot;
	size?: number;
}) => {
	const Icon = SPOT_META[spot].icon;
	return <Icon size={size} />;
};

export const SpotLabel = ({ spot }: { spot: VenueSpot }) => {
	const { label, icon: Icon } = SPOT_META[spot];
	return (
		<span
			style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
			title={label}
		>
			<Icon size={12} />
			{label}
		</span>
	);
};
