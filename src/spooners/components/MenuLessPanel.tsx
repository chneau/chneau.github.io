import {
	Badge,
	Box,
	Card,
	Group,
	Stack,
	Text,
	UnstyledButton,
} from "@mantine/core";
import { SPOT_META } from "../derive";
import { miles } from "../price";
import type { SparseVenue } from "../types";

type Props = {
	venues: SparseVenue[];
	onSelect: (ref: number) => void;
};

/**
 * Pubs the API knows about but never quotes - airports and Haven parks whose
 * menu is not published. Listed so they are not simply invisible.
 */
export const MenuLessPanel = ({ venues, onSelect }: Props) => {
	if (!venues.length) {
		return null;
	}
	return (
		<Card withBorder padding="sm" radius="md">
			<Group justify="space-between" mb={4}>
				<Text size="xs" c="dimmed" fw={700} tt="uppercase">
					No published menu
				</Text>
				<Badge size="xs" variant="light" color="gray">
					{venues.length}
				</Badge>
			</Group>
			<Text size="xs" c="dimmed" mb={6}>
				These pubs exist but the API gives no menu, so they have no prices to
				plot. Listed regardless of the map filters (airports included); the grey
				markers follow them.
			</Text>
			<Stack gap={2}>
				{venues.map((venue) => (
					<UnstyledButton
						key={venue.ref}
						onClick={() => onSelect(venue.ref)}
						style={{
							display: "block",
							width: "100%",
							padding: "5px 6px",
							borderRadius: 6,
						}}
					>
						<Group justify="space-between" gap={8} wrap="nowrap">
							<Box style={{ minWidth: 0 }}>
								<Text size="sm" lineClamp={1}>
									{venue.spot !== "high-street"
										? `${SPOT_META[venue.spot].emoji} `
										: ""}
									{venue.name}
								</Text>
								<Text size="xs" c="dimmed" lineClamp={1}>
									{[venue.town, venue.postcode].filter(Boolean).join(", ")}
									{venue.distance != null ? ` · ${miles(venue.distance)}` : ""}
									{venue.reason ? ` · ${venue.reason}` : ""}
								</Text>
							</Box>
						</Group>
					</UnstyledButton>
				))}
			</Stack>
		</Card>
	);
};
