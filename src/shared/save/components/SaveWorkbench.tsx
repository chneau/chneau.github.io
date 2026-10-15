import { Box, Grid, Stack } from "@mantine/core";
import { useState } from "react";
import { AppNav, SkipLink, useThemeMode } from "../../index";
import type { Bytes } from "../bytes";
import type { SaveCodec } from "../types";
import { useSaveDocument } from "../useSaveDocument";
import { ConfirmDialog } from "./ConfirmDialog";
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

	// Both actions below throw staged edits away, so both ask first. The
	// dialogs live here rather than in the two components because one hook
	// already owns the document, and a second piece of state per button would
	// be two identical confirmations to keep in step.
	const [changeFileOpen, setChangeFileOpen] = useState(false);
	const [clearOpen, setClearOpen] = useState(false);

	// With nothing staged, both actions are harmless and the dialog would only
	// be in the way; the count is read at click time rather than captured in a
	// render, so a stale count cannot be named.
	const confirmLeave = () => {
		if (edits.length === 0) {
			reset();
			return;
		}
		setChangeFileOpen(true);
	};

	const confirmClear = () => {
		if (edits.length === 0) {
			clearEdits();
			return;
		}
		setClearOpen(true);
	};

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
								loading={loading}
								note={sample.note}
								onLoad={() => {
									void sample
										.load()
										.then((source) => open(sample.name, source))
										// `sample.load()` fetches a bundled asset and can reject
										// before `open` ever runs. Unhandled, that was a rejected
										// promise with no message and a button that looked broken,
										// on the one path a visitor without a save file can take.
										.catch(() => undefined);
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
				onChangeFile={confirmLeave}
				onRebuild={() => void rebuild()}
				theme={{ dark: theme.dark, onToggle: theme.toggle }}
			/>

			{/*
			 * The workspace replaces the landing screen's whole subtree, and it
			 * took two things with it that nothing restored: `<main id="main">`,
			 * which is what `SkipLink` targets and what gives the page its
			 * landmark, and the page's only `<h1>`. A visitor who had already
			 * skipped to content lost the target the moment a save was opened,
			 * and one navigating by heading reached the format notes' `h4` with
			 * no page title above it.
			 *
			 * The heading names the file, because that is what changed; the game
			 * is already in the navbar's title.
			 */}
			<main id="main" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
				<Box maw={1400} mx="auto" px="xl" py="lg">
					<h1 className="sr-only">Editing {name}</h1>
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
									onClear={confirmClear}
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
			</main>

			{/* Both dialogs mirror the Crimson Desert editor's wording, count and
					all: a save editor that names the loss it is about to cause is the
					one thing standing between a misclick and a lost evening's work. */}
			<ConfirmDialog
				opened={changeFileOpen}
				title="Open another save?"
				body={`Leaving this save discards all ${edits.length} staged change${
					edits.length === 1 ? "" : "s"
				}. Rebuild and download the save first if you want to keep them.`}
				confirmLabel="Discard and leave"
				cancelLabel="Cancel"
				dangerous
				onCancel={() => setChangeFileOpen(false)}
				onConfirm={() => {
					setChangeFileOpen(false);
					reset();
				}}
			/>

			<ConfirmDialog
				opened={clearOpen}
				title="Discard all changes?"
				body={`Are you sure you want to discard all ${edits.length} staged change${
					edits.length === 1 ? "" : "s"
				}? This action cannot be undone.`}
				confirmLabel="Discard all"
				dangerous
				onCancel={() => setClearOpen(false)}
				onConfirm={() => {
					setClearOpen(false);
					clearEdits();
				}}
			/>
		</Box>
	);
};
