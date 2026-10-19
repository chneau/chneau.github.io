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

export type SaveSample = {
	readonly name: string;
	readonly load: () => Promise<Bytes>;
	readonly note: string;
};

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

	const [changeFileOpen, setChangeFileOpen] = useState(false);
	const [clearOpen, setClearOpen] = useState(false);

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
								tables={codec.tables}
							/>
						</Grid.Col>
					</Grid>
				</Box>
			</main>

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
