import { Badge, Box, Tooltip, UnstyledButton } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { Beer, Copy, Settings, TriangleAlert, Trophy } from "lucide-react";
import { useEffect } from "react";
import type { ShortcutGroup } from "../../shared";
import { AppNav, HeaderAction } from "../../shared";
import { useThemeMode } from "../../shared/hooks/useThemeMode";
import type { CacheStats, VenueInfo } from "../types";
import { PubSearch } from "./PubSearch";

type Dataset = {
	stats: CacheStats;
	itemCount: number;
	venues: VenueInfo[];
	onSelectVenue: (ref: number) => void;
};

type Props = {
	dataset?: Dataset;
	converting: boolean;
	displayCurrency: string;
	rateIssue: boolean;
	copied: boolean;
	onShare: () => void;
	onValueOpen: () => void;
	onSettingsOpen: () => void;
	shortcuts: ShortcutGroup[];
};

const RATE_TOOLTIP =
	"Exchange rates aren't available, so prices stay in each pub's own currency. Open Settings to see the error and retry.";

const RATE_LABEL =
	"Rates unavailable — prices stay in each pub's own currency. Open Settings.";

export const AppHeader = ({
	dataset,
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
	const isCompact = useMediaQuery("(max-width: 34em)");

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
			hasCommandPalette
			icon={<Beer size={22} />}
			title="Spooners"
			subtitle={
				<Box component="span" visibleFrom="sm">
					Pub prices on a map
				</Box>
			}
			theme={{
				dark,
				onToggle: toggle,
			}}
			shortcuts={shortcuts}
			center={
				<>
					{converting ? (
						<Badge variant="light" color="blue" size="lg">
							{isCompact ? displayCurrency : `converted → ${displayCurrency}`}
						</Badge>
					) : null}
					{rateIssue ? (
						<Tooltip
							label={RATE_TOOLTIP}
							multiline
							w={260}
							withArrow
							events={{ hover: true, focus: true, touch: false }}
						>
							<UnstyledButton
								aria-label={RATE_LABEL}
								onClick={onSettingsOpen}
								style={{ borderRadius: 999, display: "inline-flex" }}
							>
								<Badge
									variant="light"
									color="yellow"
									size="lg"
									leftSection={<TriangleAlert size={12} />}
									style={{
										color:
											"light-dark(var(--mantine-color-amber-8), var(--mantine-color-yellow-light-color))",
									}}
								>
									{isCompact ? null : "Rates unavailable"}
								</Badge>
							</UnstyledButton>
						</Tooltip>
					) : null}
					{dataset ? (
						<Badge variant="light" size="lg" visibleFrom="lg">
							{dataset.stats.venuesWithData} pubs · {dataset.itemCount} items
						</Badge>
					) : null}
					{dataset ? (
						<Box visibleFrom="md" w={272}>
							<PubSearch
								venues={dataset.venues}
								onSelect={dataset.onSelectVenue}
							/>
						</Box>
					) : null}
				</>
			}
			actions={
				<>
					{dataset ? (
						<HeaderAction
							iconOnly
							label="Settings"
							menuLabel="Settings"
							icon={<Settings size={16} />}
							onClick={onSettingsOpen}
						/>
					) : null}
					{dataset ? (
						<HeaderAction
							iconOnly
							label="Value charts"
							menuLabel="Value charts"
							icon={<Trophy size={16} />}
							onClick={onValueOpen}
						/>
					) : null}
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
