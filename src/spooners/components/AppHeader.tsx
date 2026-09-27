import { Badge, Box, Tooltip, useMantineColorScheme } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { Beer, Copy, Settings, TriangleAlert, Trophy } from "lucide-react";
import { useEffect } from "react";
import {
	AppSwitcher,
	BackHome,
	Brand,
	AppHeader as Header,
	HeaderAction,
	SchemeToggle,
} from "../../shared";
import type { CacheStats, VenueInfo } from "../types";
import { PubSearch } from "./PubSearch";

type Props = {
	stats: CacheStats;
	itemCount: number;
	venues: VenueInfo[];
	onSelectVenue: (ref: number) => void;
	converting: boolean;
	displayCurrency: string;
	/** Set when a conversion was asked for but rates are unavailable. */
	rateIssue?: boolean;
	copied: boolean;
	onShare: () => void;
	onValueOpen: () => void;
	onSettingsOpen: () => void;
};

/** The top bar: branding, live counts, pub search, value charts and app actions. */
export const AppHeader = ({
	stats,
	itemCount,
	venues,
	onSelectVenue,
	converting,
	displayCurrency,
	rateIssue,
	copied,
	onShare,
	onValueOpen,
	onSettingsOpen,
}: Props) => {
	const { colorScheme, setColorScheme } = useMantineColorScheme();
	const isNarrow = useMediaQuery("(max-width: 30em)");
	const dark = colorScheme === "dark";

	useEffect(() => {
		if (copied) {
			notifications.show({
				message: "Link copied to clipboard",
				color: "teal",
				autoClose: 2000,
			});
		}
	}, [copied]);

	return (
		<Header
			brand={
				<Brand
					href="/"
					icon={<Beer size={22} />}
					title="Spooners"
					subtitle="Pub prices on a map — build a round, see what every pub charges"
				/>
			}
			center={
				<>
					{converting ? (
						<Badge variant="light" color="blue" size="lg">
							{isNarrow ? displayCurrency : `converted → ${displayCurrency}`}
						</Badge>
					) : null}
					{rateIssue ? (
						<Tooltip
							label="Exchange rates aren't available, so prices stay in each pub's own currency. Open Settings to see the error and retry."
							multiline
							w={260}
							withArrow
						>
							<Badge
								variant="light"
								color="yellow"
								size="lg"
								leftSection={<TriangleAlert size={12} />}
								onClick={onSettingsOpen}
								style={{ cursor: "pointer" }}
							>
								{isNarrow
									? "native prices"
									: "rates unavailable · native prices"}
							</Badge>
						</Tooltip>
					) : null}
					<Badge variant="light" size="lg" visibleFrom="md">
						{stats.venuesWithData} pubs · {itemCount} items
					</Badge>
					<Box visibleFrom="md" w={220}>
						<PubSearch venues={venues} onSelect={onSelectVenue} />
					</Box>
				</>
			}
			actions={
				<>
					<BackHome />
					<AppSwitcher />
					<HeaderAction
						iconOnly
						label="Value charts"
						icon={<Trophy size={16} />}
						onClick={onValueOpen}
					/>
					<HeaderAction
						iconOnly
						label={copied ? "Link copied" : "Copy a link to this view"}
						icon={<Copy size={16} />}
						active={copied}
						onClick={onShare}
					/>
					<HeaderAction
						iconOnly
						label="Settings"
						icon={<Settings size={16} />}
						onClick={onSettingsOpen}
					/>
					<SchemeToggle
						dark={dark}
						onToggle={() => setColorScheme(dark ? "light" : "dark")}
					/>
				</>
			}
		/>
	);
};
