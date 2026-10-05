import {
	Anchor,
	Badge,
	Box,
	Divider,
	Flex,
	Group,
	NavLink,
	Paper,
	ScrollArea,
	Text,
} from "@mantine/core";
import type { LucideIcon } from "lucide-react";
import {
	Archive,
	Backpack,
	Boxes,
	CheckCheck,
	Database,
	HardDrive,
	LockKeyhole,
	Paintbrush,
	ShieldCheck,
	Signature,
	Sparkles,
	TrendingUp,
	Users,
} from "lucide-react";
import type { ReactNode } from "react";
import type { CompanionCategory } from "@/lib/companions";
import { companionLabels } from "@/lib/companions";
import {
	editorViewInfo,
	type ParseResult,
	type SaveView,
	storageName,
} from "@/lib/inventory";
import { Brand } from "../../shared";

const formatBytes = (bytes: number): string => {
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const storageIcon = (key: number): LucideIcon => {
	if (key === 2) return Backpack;
	if (key === 10) return Archive;
	if (key === 14) return LockKeyhole;
	return Boxes;
};

/**
 * The sections of the rail other than the storages.
 *
 * Every one of these links is the same thing — a view, an icon, a label, and
 * optionally how many changes are queued in it and how much it holds — written
 * out nine times. They are a list here for one reason: the badge, the count and
 * the "select then close the drawer" click are the same in all of them, and
 * one of the nine had drifted from the other eight.
 */
type RailSection = {
	view: SaveView;
	icon: LucideIcon;
	label: string;
	/** What the section holds, shown beside the staged count. */
	count: number | undefined;
};

const saveSections = (result: ParseResult): RailSection[] => [
	{
		view: "dyes",
		icon: Paintbrush,
		label: editorViewInfo.dyes.label,
		count: result.dyes?.items.length,
	},
	{
		view: "condition",
		icon: ShieldCheck,
		label: editorViewInfo.condition.label,
		count: result.conditions?.entries.length,
	},
];

const SECTION_LABEL = {
	size: "10px",
	style: { letterSpacing: "0.16em" },
} as const;

/**
 * A headed group of links: a rule, then a small caps label.
 *
 * Four sections repeat this pair, and one of them had drifted — a label written
 * by hand rather than spread — so the pair is written once.
 */
const Section = ({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) => (
	<>
		<Divider my="sm" />
		<Text c="dimmed" tt="uppercase" px="xs" pb="xs" {...SECTION_LABEL}>
			{title}
		</Text>
		{children}
	</>
);

/**
 * The navigation rail: the open save, its storage locations, and the sections
 * that are not the inventory. It holds no state of its own — the page owns
 * which view is active, so the two stay in step even from the mobile drawer.
 */
export const AppSidebar = ({
	result,
	fileName,
	fileSize,
	storages,
	view,
	activeStorage,
	stagedStorageCounts = {},
	stagedViewCounts = {} as Record<SaveView, number>,
	onSelectStorage,
	onSelectView,
	onNavigate,
}: {
	result: ParseResult | null;
	fileName: string;
	fileSize: number;
	storages: { key: number; records: number }[];
	view: SaveView;
	activeStorage: number | null;
	stagedStorageCounts?: Record<number, number>;
	stagedViewCounts?: Record<SaveView, number>;
	onSelectStorage: (key: number) => void;
	onSelectView: (view: SaveView) => void;
	/** Called after a choice, so the mobile drawer can close itself. */
	onNavigate?: () => void;
}) => {
	/** One link in the rail: its icon, label, staged badge and held count. */
	const sectionLink = (section: RailSection) => {
		const stagedCount = stagedViewCounts[section.view] ?? 0;
		return (
			<NavLink
				key={section.view}
				active={view === section.view}
				leftSection={<section.icon size={16} />}
				label={section.label}
				rightSection={
					section.count === undefined ? (
						stagedCount > 0 ? (
							<Badge size="xs" variant="filled" color="brand">
								{stagedCount}
							</Badge>
						) : undefined
					) : (
						<Group gap={6} wrap="nowrap">
							{stagedCount > 0 && (
								<Badge size="xs" variant="filled" color="brand">
									{stagedCount}
								</Badge>
							)}
							<Text size="xs" c="dimmed">
								{section.count}
							</Text>
						</Group>
					)
				}
				onClick={() => {
					onSelectView(section.view);
					onNavigate?.();
				}}
			/>
		);
	};

	return (
		<Flex
			direction="column"
			h="100%"
			w={272}
			style={{
				borderRight: "1px solid var(--app-border)",
				background: "var(--app-surface-2)",
				flexShrink: 0,
			}}
		>
			<Group
				gap="sm"
				p="lg"
				wrap="nowrap"
				style={{ borderBottom: "1px solid var(--app-border)" }}
			>
				<Brand
					href="/"
					icon={<Database size={16} strokeWidth={2} />}
					title="Save Workshop"
					subtitle="Crimson Desert"
				/>
			</Group>

			<ScrollArea style={{ flex: 1, minHeight: 0 }} p="sm">
				<Text c="dimmed" tt="uppercase" px="xs" pb="xs" {...SECTION_LABEL}>
					Save file
				</Text>
				{result ? (
					<Paper withBorder p="sm" bg="var(--app-surface-3)">
						<Group gap="sm" wrap="nowrap" align="flex-start">
							<HardDrive
								size={16}
								color="var(--app-text-muted)"
								strokeWidth={2}
								style={{ flexShrink: 0, marginTop: 2 }}
							/>
							<Box style={{ minWidth: 0 }}>
								<Text size="sm" fw={500} truncate>
									{fileName}
								</Text>
								<Text size="xs" c="dimmed" ff="monospace">
									{formatBytes(fileSize)} · container v{result.containerVersion}
								</Text>
							</Box>
						</Group>
					</Paper>
				) : (
					<Text size="xs" c="dimmed" px="xs">
						No save is open.
					</Text>
				)}

				<Section title="Storage locations">
					{storages.map((storage) => {
						const Icon = storageIcon(storage.key);
						const stagedCount = stagedStorageCounts[storage.key] ?? 0;
						return (
							<NavLink
								key={storage.key}
								active={view === "inventory" && activeStorage === storage.key}
								leftSection={<Icon size={16} />}
								label={storageName(storage.key)}
								rightSection={
									<Group gap={6} wrap="nowrap">
										{stagedCount > 0 && (
											<Badge size="xs" variant="filled" color="brand">
												{stagedCount}
											</Badge>
										)}
										<Text size="xs" c="dimmed">
											{storage.records}
										</Text>
									</Group>
								}
								onClick={() => {
									onSelectStorage(storage.key);
									onNavigate?.();
								}}
							/>
						);
					})}
				</Section>

				{result && (
					<>
						<Section title="Gear">
							{saveSections(result).map(sectionLink)}
						</Section>

						<Section title="Companions">
							{(
								Object.entries(companionLabels) as [CompanionCategory, string][]
							).map(([category, label]) => (
								<NavLink
									key={category}
									active={view === category}
									leftSection={<Users size={16} />}
									label={label}
									rightSection={
										(stagedViewCounts[category] ?? 0) > 0 ? (
											<Badge size="xs" variant="filled" color="brand">
												{stagedViewCounts[category]}
											</Badge>
										) : undefined
									}
									onClick={() => {
										onSelectView(category);
										onNavigate?.();
									}}
								/>
							))}
							{sectionLink({
								view: "names",
								icon: Signature,
								label: editorViewInfo.names.label,
								count: result.names?.rows.length,
							})}
						</Section>

						<Section title="Progression">
							{sectionLink({
								view: "skills",
								icon: Sparkles,
								label: editorViewInfo.skills.label,
								count: result.skills?.skillsMissing,
							})}
							{sectionLink({
								view: "levels",
								icon: TrendingUp,
								label: editorViewInfo.levels.label,
								count: result.levels?.entries.length,
							})}
							{sectionLink({
								view: "quests",
								icon: CheckCheck,
								label: editorViewInfo.quests.label,
								// A quest's count is its rows, which runs to tens of
								// thousands; the staged badge alone is the useful part.
								count: undefined,
							})}
						</Section>
					</>
				)}
			</ScrollArea>

			<Box p="md" style={{ borderTop: "1px solid var(--app-border)" }}>
				<Text c="dimmed" tt="uppercase" {...SECTION_LABEL}>
					Credits
				</Text>
				<Text size="xs" c="dimmed" mt={4}>
					Inspired by{" "}
					<Anchor
						size="xs"
						href="https://crimson-desert-save-editor.exponet255.chatgpt.site/"
						target="_blank"
						rel="noreferrer"
					>
						Crimson Desert Save Editor
					</Anchor>{" "}
					and{" "}
					<Anchor
						size="xs"
						href="https://github.com/NattKh/CRIMSON-DESERT-SAVE-EDITOR-AND-GAME-MODS"
						target="_blank"
						rel="noreferrer"
					>
						NattKh's editor & mods
					</Anchor>
					.
				</Text>
			</Box>

			<Group
				gap="xs"
				p="md"
				wrap="nowrap"
				align="flex-start"
				style={{ borderTop: "1px solid var(--app-border)" }}
			>
				<LockKeyhole
					size={14}
					color="var(--mantine-primary-color-filled)"
					style={{ flexShrink: 0, marginTop: 2, opacity: 0.75 }}
				/>
				<Text size="xs" c="dimmed">
					Files stay on this device and are processed inside your browser.
				</Text>
			</Group>
		</Flex>
	);
};
