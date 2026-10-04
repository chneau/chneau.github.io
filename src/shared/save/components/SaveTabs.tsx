import { Alert, Box, Divider, Stack, Tabs, Text, Title } from "@mantine/core";
import { CheckCircle2 } from "lucide-react";
import type { JsonValue } from "../json";
import type { FormatNote, SaveEdit } from "../types";
import { HexViewer } from "./HexViewer";
import { JsonInspector } from "./JsonInspector";

/**
 * The workspace's right-hand tab chrome: the inspector, the raw bytes, and the
 * format story.
 *
 * Split out of `SaveWorkbench` so the tab list and its three panels are one
 * unit. The panels take only what they render — the working document, the
 * staged paths, the search box — so a change to the tabs cannot reach into the
 * state machine.
 */
export const SaveTabs = ({
	tab,
	onTabChange,
	doc,
	staged,
	onStage,
	search,
	onSearchChange,
	bytes,
	notes,
}: {
	tab: string | null;
	onTabChange: (value: string | null) => void;
	doc: JsonValue;
	staged: ReadonlySet<string>;
	onStage: (edit: SaveEdit) => void;
	search: string;
	onSearchChange: (value: string) => void;
	bytes: Uint8Array;
	notes: readonly FormatNote[];
}) => (
	<Tabs
		value={tab}
		onChange={onTabChange}
		keepMounted={false}
		style={{
			display: "flex",
			flexDirection: "column",
			height: "100%",
			minHeight: 520,
		}}
	>
		<Tabs.List mb="sm">
			<Tabs.Tab value="inspect">Inspector</Tabs.Tab>
			<Tabs.Tab value="raw">Raw bytes</Tabs.Tab>
			<Tabs.Tab value="format">The format</Tabs.Tab>
		</Tabs.List>

		<Tabs.Panel value="inspect" style={{ flex: 1, minHeight: 0 }}>
			<JsonInspector
				doc={doc}
				staged={staged}
				onStage={onStage}
				search={search}
				onSearchChange={onSearchChange}
			/>
		</Tabs.Panel>

		<Tabs.Panel
			value="raw"
			style={{
				flex: 1,
				minHeight: 0,
				maxHeight: 640,
				border: "1px solid var(--app-border)",
				borderRadius: "var(--app-radius-md)",
				background: "var(--app-surface)",
				padding: "var(--app-radius-md)",
			}}
		>
			<HexViewer bytes={bytes} />
		</Tabs.Panel>

		<Tabs.Panel value="format">
			<Stack gap="lg" maw={760}>
				{notes.map((note) => (
					<Box key={note.title}>
						<Title order={4} mb={4}>
							{note.title}
						</Title>
						<Text size="sm" c="dimmed" lh={1.7}>
							{note.body}
						</Text>
					</Box>
				))}
				<Divider />
				<Alert
					variant="light"
					color="teal"
					icon={<CheckCircle2 size={16} strokeWidth={2} />}
					title="How your file is checked"
				>
					<Text size="sm">
						Before you are given a rebuilt file it is decoded again and compared
						against the values you set. A file that does not read back is not
						offered at all.
					</Text>
				</Alert>
			</Stack>
		</Tabs.Panel>
	</Tabs>
);
