import {
	Alert,
	Badge,
	Box,
	Button,
	Card,
	Divider,
	Grid,
	Group,
	Stack,
	Tabs,
	Text,
	Title,
	Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
	CheckCircle2,
	Download,
	FileUp,
	RefreshCw,
	Sparkles,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { AppNav, SkipLink, useThemeMode } from "../../index";
import type { Bytes } from "../bytes";
import { applyEdits, stageEdits, withoutPath } from "../edits";
import {
	downloadBytes,
	formatBytes,
	readFileBytes,
	rebuiltName,
} from "../file";
import { formatPath, type JsonValue } from "../json";
import {
	describeVerdict,
	type RoundTripVerdict,
	verifyRoundTrip,
} from "../roundtrip";
import type { SaveCodec, SaveEdit } from "../types";
import { HexViewer } from "./HexViewer";
import { JsonInspector } from "./JsonInspector";
import { SaveHero, SaveLanding } from "./SaveLanding";
import { QuickChanges, SaveSummary, StagedEdits } from "./SaveSidebar";

/** A bundled sample, so the page is explorable before anyone has a save. */
export type SaveSample = {
	readonly name: string;
	readonly load: () => Promise<Bytes>;
	readonly note: string;
};

/**
 * Everything a save editor page is, given a codec.
 *
 * One component for six formats is only defensible because the parts that
 * differ are all data — the notes, the summary, the quick actions — while the
 * parts that are hard (parsing a save, rebuilding it, proving the rebuild is
 * sound, never uploading it) are identical and are written once.
 */
export const SaveWorkbench = ({
	codec,
	sample,
}: {
	codec: SaveCodec;
	sample?: SaveSample;
}) => {
	const [name, setName] = useState<string | null>(null);
	const [bytes, setBytes] = useState<Bytes | null>(null);
	const [doc, setDoc] = useState<JsonValue | null>(null);
	const [edits, setEdits] = useState<readonly SaveEdit[]>([]);
	const [loading, setLoading] = useState(false);
	const [status, setStatus] = useState("");
	const [error, setError] = useState("");
	const [building, setBuilding] = useState(false);
	const [search, setSearch] = useState("");
	const [tab, setTab] = useState<string | null>("inspect");
	const theme = useThemeMode();

	const open = useCallback(
		async (fileName: string, source: Bytes) => {
			setLoading(true);
			setError("");
			setStatus(`Reading ${fileName}`);
			try {
				// Yield once so the loading state paints before a multi-megabyte
				// parse starts; otherwise the tab freezes on the old screen and
				// the progress indicator is never seen.
				await new Promise((resolve) => setTimeout(resolve, 0));
				const decoded = await codec.decode(source);
				setName(fileName);
				setBytes(source);
				setDoc(decoded);
				setEdits([]);
				setSearch("");
			} catch (cause) {
				setError(
					cause instanceof Error
						? cause.message
						: "The file could not be read as this game's save.",
				);
			} finally {
				setLoading(false);
				setStatus("");
			}
		},
		[codec],
	);

	const onSelectFile = useCallback(
		(file: File) => {
			void readFileBytes(file).then((source) => open(file.name, source));
		},
		[open],
	);

	const stage = useCallback((edit: SaveEdit) => {
		setEdits((current) => stageEdits(current, [edit]));
	}, []);

	const reset = useCallback(() => {
		setName(null);
		setBytes(null);
		setDoc(null);
		setEdits([]);
		setError("");
		setSearch("");
	}, []);

	// Computed during render rather than stored: the working document is a
	// function of the loaded save and the staged edits, and keeping it derived
	// is what stops a render reading a document a previous render changed.
	const working = useMemo(
		() => (doc === null ? null : applyEdits(doc, edits)),
		[doc, edits],
	);

	const stagedPaths = useMemo(
		() => new Set(edits.map((edit) => formatPath(edit.path))),
		[edits],
	);

	const summary = useMemo(
		() => (doc === null ? [] : codec.summarise(doc)),
		[codec, doc],
	);

	const rebuild = useCallback(async () => {
		if (working === null || bytes === null || name === null) return;
		setBuilding(true);
		try {
			const verdict: RoundTripVerdict = await verifyRoundTrip(
				codec,
				bytes,
				working,
				edits.length > 0,
			);
			if (verdict.kind === "failed") {
				// A failed verification must not produce a file. Handing over
				// bytes that do not read back is precisely the outcome these
				// tools exist to prevent.
				notifications.show({
					color: "red",
					title: "Not handing this one over",
					message: verdict.reason,
				});
				return;
			}
			const rebuilt = await codec.encode(working);
			downloadBytes(rebuilt, rebuiltName(name));
			notifications.show({
				color: verdict.kind === "semantic" ? "yellow" : "teal",
				title: "Rebuilt save downloaded",
				message: describeVerdict(verdict),
			});
		} catch (cause) {
			notifications.show({
				color: "red",
				title: "Could not rebuild the save",
				message: cause instanceof Error ? cause.message : "Unexpected failure.",
			});
		} finally {
			setBuilding(false);
		}
	}, [bytes, codec, edits.length, name, working]);

	if (doc === null || bytes === null || name === null || working === null) {
		return (
			<Box
				style={{
					display: "flex",
					flexDirection: "column",
					height: "100dvh",
					background: "var(--app-bg)",
				}}
			>
				<SkipLink />
				<AppNav
					title={codec.game}
					subtitle="Save editor"
					theme={{ dark: theme.dark, onToggle: theme.toggle }}
				/>
				{/*
				 * The hero carries the page's only `<h1>`. Without it the landing
				 * screen was a drop target and a column of notes with no
				 * heading at all, which is a real accessibility gap rather than
				 * a cosmetic one: a screen-reader user arriving on a page with no
				 * heading has nothing to orient by.
				 */}
				<main id="main" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
					<Box maw={1240} mx="auto" px="xl" pt="xl">
						<SaveHero codec={codec} />
					</Box>
					<SaveLanding
						codec={codec}
						loading={loading}
						status={status}
						error={error}
						onSelectFile={onSelectFile}
					>
						{sample ? (
							<Card
								mt="md"
								padding="md"
								radius="md"
								style={{
									border: "1px solid var(--app-border)",
									background: "var(--app-surface)",
								}}
							>
								<Group justify="space-between" wrap="nowrap" align="center">
									<Box style={{ minWidth: 0 }}>
										<Text size="sm" fw={600}>
											No save to hand? Load the sample.
										</Text>
										<Text size="xs" c="dimmed">
											{sample.note}
										</Text>
									</Box>
									<Button
										variant="light"
										leftSection={<Sparkles size={15} strokeWidth={2} />}
										onClick={() => {
											void sample
												.load()
												.then((source) => open(sample.name, source));
										}}
									>
										Load sample
									</Button>
								</Group>
							</Card>
						) : null}
					</SaveLanding>
				</main>
			</Box>
		);
	}

	return (
		<Box
			style={{
				display: "flex",
				flexDirection: "column",
				height: "100dvh",
				background: "var(--app-bg)",
			}}
		>
			<AppNav
				title={codec.game}
				subtitle="Save editor"
				theme={{ dark: theme.dark, onToggle: theme.toggle }}
				center={
					<Group gap="xs" wrap="nowrap">
						<Text size="sm" fw={600} truncate>
							{name}
						</Text>
						<Badge size="xs" variant="light" color="gray">
							{formatBytes(bytes.length)}
						</Badge>
						{edits.length > 0 ? (
							<Badge size="xs" variant="filled" color="yellow">
								{edits.length} staged
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
								onClick={reset}
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
							onClick={() => void rebuild()}
						>
							Rebuild &amp; download
						</Button>
					</Group>
				}
			/>

			<Box style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
				<Box maw={1400} mx="auto" px="xl" py="lg">
					<Grid gap="xl">
						<Grid.Col span={{ base: 12, lg: 4, xl: 3 }}>
							<Stack gap="md">
								<SaveSummary rows={summary} />
								<QuickChanges
									actions={codec.actions}
									doc={working}
									onStage={(planned) =>
										setEdits((current) => stageEdits(current, planned))
									}
								/>
								<StagedEdits
									edits={edits}
									onRevert={(path) =>
										setEdits((current) => withoutPath(current, path))
									}
									onClear={() => setEdits([])}
								/>
							</Stack>
						</Grid.Col>

						<Grid.Col span={{ base: 12, lg: 8, xl: 9 }}>
							<Tabs
								value={tab}
								onChange={setTab}
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
										doc={working}
										staged={stagedPaths}
										onStage={stage}
										search={search}
										onSearchChange={setSearch}
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
										{codec.notes.map((note) => (
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
												Before you are given a rebuilt file it is decoded again
												and compared against the values you set. A file that
												does not read back is not offered at all.
											</Text>
										</Alert>
									</Stack>
								</Tabs.Panel>
							</Tabs>
						</Grid.Col>
					</Grid>
				</Box>
			</Box>
		</Box>
	);
};
