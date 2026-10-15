import { Badge, Button, Group, Text, Tooltip } from "@mantine/core";
import { Download, FileUp, RefreshCw } from "lucide-react";
import { AppNav } from "../../index";
import { formatBytes } from "../file";

export const SaveWorkspaceNav = ({
	game,
	name,
	byteLength,
	stagedCount,
	building,
	onChangeFile,
	onRebuild,
	theme,
}: {
	game: string;
	name: string;
	byteLength: number;
	stagedCount: number;
	building: boolean;
	onChangeFile: () => void;
	onRebuild: () => void;
	theme: { dark: boolean; onToggle: () => void };
}) => (
	<AppNav
		title={game}
		subtitle="Save editor"
		theme={theme}
		center={
			<Group gap="xs" wrap="nowrap">
				<Text size="sm" fw={600} truncate>
					{name}
				</Text>
				<Badge size="xs" variant="light" color="gray">
					{formatBytes(byteLength)}
				</Badge>
				{stagedCount > 0 ? (
					<Badge size="xs" variant="filled" color="yellow">
						{stagedCount} staged
					</Badge>
				) : null}
			</Group>
		}
		actions={
			<Group gap="xs">
				<Tooltip label="Open a different save" withArrow>
					<Button
						variant="default"
						size="compact-sm"
						leftSection={<FileUp size={14} strokeWidth={2} />}
						onClick={onChangeFile}
					>
						Change file
					</Button>
				</Tooltip>
				<Button
					size="compact-sm"
					leftSection={
						building ? (
							<RefreshCw size={14} strokeWidth={2} />
						) : (
							<Download size={14} strokeWidth={2} />
						)
					}
					loading={building}
					onClick={onRebuild}
				>
					Rebuild &amp; download
				</Button>
			</Group>
		}
	/>
);
