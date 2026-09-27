import {
	ActionIcon,
	Badge,
	Box,
	Button,
	Group,
	Text,
	Title,
	Tooltip,
	useMantineColorScheme,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { Beer, Copy, Settings, Trophy } from "lucide-react";
import { SchemeToggle } from "../../shared";
import type { CacheStats, VenueInfo } from "../types";
import { PubSearch } from "./PubSearch";

type Props = {
	stats: CacheStats;
	itemCount: number;
	venues: VenueInfo[];
	onSelectVenue: (ref: number) => void;
	converting: boolean;
	displayCurrency: string;
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
	copied,
	onShare,
	onValueOpen,
	onSettingsOpen,
}: Props) => {
	const { colorScheme, setColorScheme } = useMantineColorScheme();
	const isNarrow = useMediaQuery("(max-width: 30em)");
	const dark = colorScheme === "dark";

	return (
		<Group
			justify="space-between"
			align="center"
			px="md"
			py="xs"
			wrap="nowrap"
			style={{
				borderBottom: "1px solid var(--mantine-color-default-border)",
			}}
		>
			<Group gap="xs" align="center" wrap="nowrap">
				<Beer size={26} />
				<Box>
					<Title order={3} lh={1}>
						Spooners
					</Title>
					<Text size="xs" c="dimmed" lineClamp={1}>
						Pub prices on a map — build a round, see what every pub charges
					</Text>
				</Box>
			</Group>
			<Group gap="xs" wrap="nowrap">
				{converting ? (
					<Badge variant="light" color="blue" size="lg">
						{isNarrow ? displayCurrency : `converted → ${displayCurrency}`}
					</Badge>
				) : null}
				<Badge variant="light" size="lg" visibleFrom="md">
					{stats.venuesWithData} pubs · {itemCount} items
				</Badge>
				<Box visibleFrom="md" w={220}>
					<PubSearch venues={venues} onSelect={onSelectVenue} />
				</Box>
				<Tooltip label="Cheapest alcohol per unit, calories per £…">
					{isNarrow ? (
						<ActionIcon
							variant="default"
							size="lg"
							aria-label="Value charts"
							onClick={onValueOpen}
						>
							<Trophy size={16} />
						</ActionIcon>
					) : (
						<Button size="xs" variant="default" onClick={onValueOpen}>
							Value charts
						</Button>
					)}
				</Tooltip>
				<Tooltip label={copied ? "Link copied" : "Copy a link to this view"}>
					{isNarrow ? (
						<ActionIcon
							variant={copied ? "filled" : "default"}
							color={copied ? "teal" : undefined}
							size="lg"
							aria-label="Share"
							onClick={onShare}
						>
							<Copy size={16} />
						</ActionIcon>
					) : (
						<Button
							size="xs"
							variant={copied ? "filled" : "default"}
							color={copied ? "teal" : undefined}
							leftSection={<Copy size={14} />}
							onClick={onShare}
						>
							{copied ? "Copied" : "Share"}
						</Button>
					)}
				</Tooltip>
				<Tooltip label="Settings">
					<ActionIcon
						variant="default"
						size="lg"
						aria-label="Settings"
						onClick={onSettingsOpen}
					>
						<Settings size={16} />
					</ActionIcon>
				</Tooltip>
				<SchemeToggle
					dark={dark}
					onToggle={() => setColorScheme(dark ? "light" : "dark")}
				/>
			</Group>
		</Group>
	);
};
