import { Badge, Box, Tooltip } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { Beer, Copy, Settings, TriangleAlert, Trophy } from "lucide-react";
import { useEffect } from "react";
import type { ShortcutGroup } from "../../shared";
import { AppNav, HeaderAction } from "../../shared";
import { useThemeMode } from "../../shared/hooks/useThemeMode";
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
	/** Shortcut groups for the help dialog `AppNav` owns. */
	shortcuts: ShortcutGroup[];
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
	shortcuts,
}: Props) => {
	const { dark, toggle } = useThemeMode();
	const isNarrow = useMediaQuery("(max-width: 30em)");

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
		<AppNav
			// This app binds the command palette, so the shared help dialog
			// may advertise it.
			hasCommandPalette
			icon={<Beer size={22} />}
			title="Spooners"
			subtitle="Pub prices on a map — build a round, see what every pub charges"
			theme={{
				dark,
				onToggle: toggle,
			}}
			shortcuts={shortcuts}
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
					{/* `AppNav` wraps these in its own `HeaderOverflow` beside the
					    shared help and theme controls, so the narrow-bar budget is
					    the whole set rather than these three alone. */}
					<HeaderAction
						iconOnly
						label="Settings"
						menuLabel="Settings"
						icon={<Settings size={16} />}
						onClick={onSettingsOpen}
					/>
					<HeaderAction
						iconOnly
						label="Value charts"
						menuLabel="Value charts"
						icon={<Trophy size={16} />}
						onClick={onValueOpen}
					/>
					<HeaderAction
						iconOnly
						label={copied ? "Link copied" : "Copy a link to this view"}
						menuLabel="Copy a link to this view"
						icon={<Copy size={16} />}
						active={copied}
						onClick={onShare}
					/>
				</>
			}
		/>
	);
};
