import {
	Anchor,
	Box,
	Center,
	Divider,
	Flex,
	Group,
	NavLink,
	Paper,
	ScrollArea,
	Text,
} from "@mantine/core";
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
import type { CompanionCategory } from "@/lib/companions";
import { companionLabels } from "@/lib/companions";
import {
	editorViewInfo,
	type ParseResult,
	type SaveView,
	storageName,
} from "@/lib/inventory";

const formatBytes = (bytes: number): string => {
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const storageIcon = (key: number) => {
	if (key === 2) return Backpack;
	if (key === 10) return Archive;
	if (key === 14) return LockKeyhole;
	return Boxes;
};

const SECTION_LABEL = {
	size: "10px",
	style: { letterSpacing: "0.16em" },
} as const;

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
	onSelectStorage: (key: number) => void;
	onSelectView: (view: SaveView) => void;
	/** Called after a choice, so the mobile drawer can close itself. */
	onNavigate?: () => void;
}) => (
	<Flex
		direction="column"
		h="100%"
		w={272}
		style={{
			borderRight: "1px solid var(--mantine-color-dark-4)",
			background: "var(--mantine-color-dark-9)",
			flexShrink: 0,
		}}
	>
		<Group
			gap="sm"
			p="lg"
			wrap="nowrap"
			style={{ borderBottom: "1px solid var(--mantine-color-dark-4)" }}
		>
			<Center
				w={36}
				h={36}
				style={{
					border: "1px solid var(--mantine-primary-color-filled)",
					background: "var(--mantine-primary-color-light)",
					color: "var(--mantine-primary-color-filled)",
					flexShrink: 0,
				}}
			>
				<Database size={16} />
			</Center>
			<Box style={{ minWidth: 0 }}>
				<Text fw={600} size="md" lh={1}>
					Save Workshop
				</Text>
				<Text
					mt={4}
					size="10px"
					c="dimmed"
					tt="uppercase"
					style={{ letterSpacing: "0.16em" }}
				>
					Crimson Desert
				</Text>
			</Box>
		</Group>

		<ScrollArea style={{ flex: 1, minHeight: 0 }} p="sm">
			<Text c="dimmed" tt="uppercase" px="xs" pb="xs" {...SECTION_LABEL}>
				Save file
			</Text>
			{result ? (
				<Paper withBorder p="sm" bg="rgba(0,0,0,0.15)">
					<Group gap="sm" wrap="nowrap" align="flex-start">
						<HardDrive
							size={16}
							color="var(--mantine-primary-color-filled)"
							style={{ flexShrink: 0, marginTop: 2 }}
						/>
						<Box style={{ minWidth: 0 }}>
							<Text size="sm" fw={500} truncate>
								{fileName}
							</Text>
							<Text size="xs" c="dimmed">
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

			<Divider my="sm" />
			<Text c="dimmed" tt="uppercase" px="xs" pb="xs" {...SECTION_LABEL}>
				Storage locations
			</Text>
			{storages.map((storage) => {
				const Icon = storageIcon(storage.key);
				return (
					<NavLink
						key={storage.key}
						active={view === "inventory" && activeStorage === storage.key}
						leftSection={<Icon size={16} />}
						label={storageName(storage.key)}
						rightSection={
							<Text size="xs" c="dimmed">
								{storage.records}
							</Text>
						}
						onClick={() => {
							onSelectStorage(storage.key);
							onNavigate?.();
						}}
					/>
				);
			})}

			{result && (
				<>
					<Divider my="sm" />
					<Text c="dimmed" tt="uppercase" px="xs" pb="xs" {...SECTION_LABEL}>
						Gear
					</Text>
					<NavLink
						active={view === "dyes"}
						leftSection={<Paintbrush size={16} />}
						label={editorViewInfo.dyes.label}
						rightSection={
							result.dyes ? (
								<Text size="xs" c="dimmed">
									{result.dyes.items.length}
								</Text>
							) : undefined
						}
						onClick={() => {
							onSelectView("dyes");
							onNavigate?.();
						}}
					/>
					<NavLink
						active={view === "condition"}
						leftSection={<ShieldCheck size={16} />}
						label={editorViewInfo.condition.label}
						rightSection={
							result.conditions ? (
								<Text size="xs" c="dimmed">
									{result.conditions.entries.length}
								</Text>
							) : undefined
						}
						onClick={() => {
							onSelectView("condition");
							onNavigate?.();
						}}
					/>

					<Divider my="sm" />
					<Text c="dimmed" tt="uppercase" px="xs" pb="xs" {...SECTION_LABEL}>
						Companions
					</Text>
					{(
						Object.entries(companionLabels) as [CompanionCategory, string][]
					).map(([category, label]) => (
						<NavLink
							key={category}
							active={view === category}
							leftSection={<Users size={16} />}
							label={label}
							onClick={() => {
								onSelectView(category);
								onNavigate?.();
							}}
						/>
					))}
					<NavLink
						active={view === "names"}
						leftSection={<Signature size={16} />}
						label={editorViewInfo.names.label}
						rightSection={
							result.names ? (
								<Text size="xs" c="dimmed">
									{result.names.rows.length}
								</Text>
							) : undefined
						}
						onClick={() => {
							onSelectView("names");
							onNavigate?.();
						}}
					/>
					<Divider my="sm" />
					<Text c="dimmed" tt="uppercase" px="xs" pb="xs" {...SECTION_LABEL}>
						Progression
					</Text>
					<NavLink
						active={view === "skills"}
						leftSection={<Sparkles size={16} />}
						label={editorViewInfo.skills.label}
						rightSection={
							result.skills ? (
								<Text size="xs" c="dimmed">
									{result.skills.skillsMissing}
								</Text>
							) : undefined
						}
						onClick={() => {
							onSelectView("skills");
							onNavigate?.();
						}}
					/>
					<NavLink
						active={view === "levels"}
						leftSection={<TrendingUp size={16} />}
						label={editorViewInfo.levels.label}
						rightSection={
							result.levels ? (
								<Text size="xs" c="dimmed">
									{result.levels.entries.length}
								</Text>
							) : undefined
						}
						onClick={() => {
							onSelectView("levels");
							onNavigate?.();
						}}
					/>
					<NavLink
						active={view === "quests"}
						leftSection={<CheckCheck size={16} />}
						label={editorViewInfo.quests.label}
						onClick={() => {
							onSelectView("quests");
							onNavigate?.();
						}}
					/>
				</>
			)}
		</ScrollArea>

		<Box p="md" style={{ borderTop: "1px solid var(--mantine-color-dark-4)" }}>
			<Text
				size="10px"
				c="dimmed"
				tt="uppercase"
				style={{ letterSpacing: "0.16em" }}
			>
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
			style={{ borderTop: "1px solid var(--mantine-color-dark-4)" }}
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
