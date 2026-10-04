import { Box, Grid, Stack } from "@mantine/core";
import { AppNav, SkipLink, useThemeMode } from "../../index";
import type { Bytes } from "../bytes";
import type { SaveCodec } from "../types";
import { useSaveDocument } from "../useSaveDocument";
import { SampleLoaderCard } from "./SampleLoaderCard";
import { SaveHero, SaveLanding } from "./SaveLanding";
import { QuickChanges, SaveSummary, StagedEdits } from "./SaveSidebar";
import { SaveTabs } from "./SaveTabs";
import { SaveWorkspaceNav } from "./SaveWorkspaceNav";

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
 * sound, never uploading it) are identical and are written once. Those hard
 * parts are the state machine in `useSaveDocument`; this component is the two
 * layouts that read from it and nothing else.
 */
export const SaveWorkbench = ({
	codec,
	sample,
}: {
	codec: SaveCodec;
	sample?: SaveSample;
}) => {
	const {
		name,
		bytes,
		doc,
		edits,
		loading,
		status,
		error,
		building,
		search,
		tab,
		working,
		stagedPaths,
		summary,
		open,
		onSelectFile,
		stage,
		stageMany,
		revert,
		clearEdits,
		reset,
		setSearch,
		setTab,
		rebuild,
	} = useSaveDocument(codec);
	const theme = useThemeMode();

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
							<SampleLoaderCard
								note={sample.note}
								onLoad={() => {
									void sample
										.load()
										.then((source) => open(sample.name, source));
								}}
							/>
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
			<SaveWorkspaceNav
				game={codec.game}
				name={name}
				byteLength={bytes.length}
				stagedCount={edits.length}
				building={building}
				onChangeFile={reset}
				onRebuild={() => void rebuild()}
				theme={{ dark: theme.dark, onToggle: theme.toggle }}
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
									onStage={stageMany}
								/>
								<StagedEdits
									edits={edits}
									onRevert={revert}
									onClear={clearEdits}
								/>
							</Stack>
						</Grid.Col>

						<Grid.Col span={{ base: 12, lg: 8, xl: 9 }}>
							<SaveTabs
								tab={tab}
								onTabChange={setTab}
								doc={working}
								staged={stagedPaths}
								onStage={stage}
								search={search}
								onSearchChange={setSearch}
								bytes={bytes}
								notes={codec.notes}
							/>
						</Grid.Col>
					</Grid>
				</Box>
			</Box>
		</Box>
	);
};
