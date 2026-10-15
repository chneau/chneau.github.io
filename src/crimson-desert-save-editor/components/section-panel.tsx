import { Alert } from "@mantine/core";
import { TriangleAlert } from "lucide-react";
import type { CompanionCatalog, CompanionEdit } from "../lib/companions";
import type { ParseResult, SaveView } from "../lib/inventory";
import type { SaveSession } from "../lib/save-engine/session";
import type { SkillEdit } from "../lib/skills";
import type {
	CompanionRenameEdit,
	DyeEdit,
	ItemConditionEdit,
	LevelEdit,
	QuestStateEdit,
	SaveEdit,
} from "../lib/staged-edits";
import { CompanionPanel } from "./companion-panel";
import { ConditionPanel } from "./condition-panel";
import { DyesPanel } from "./dyes-panel";
import { LevelsPanel } from "./levels-panel";
import { NamesPanel } from "./names-panel";
import { QuestsPanel } from "./quests-panel";
import { SkillsPanel } from "./skills-panel";

export const SkippedRecordsAlert = ({
	count,
	details,
}: {
	count: number;
	details: string[];
}) => (
	<Alert
		color="yellow"
		role="status"
		icon={<TriangleAlert size={16} strokeWidth={2} />}
		title={`${count} inventory record${count === 1 ? "" : "s"} could not be read`}
		mx="md"
		mt="md"
		style={{ flexShrink: 0 }}
	>
		These records are withheld rather than shown with guessed values, so the
		editor cannot change them. The rest of the save is unaffected:{" "}
		{details.join("; ")}.
	</Alert>
);

export const SectionPanel = ({
	view,
	result,
	session,
	edits,
	companionEdits,
	companionCatalog,
	busy,
	error,
	nameOf,
	onStageSkill,
	onDiscardSkill,
	onStageCompanion,
	onDiscardCompanion,
	onStageLevels,
	onStageQuests,
	onStageDyes,
	onStageConditions,
	onStageNames,
}: {
	view: SaveView;
	result: ParseResult;
	session: SaveSession;
	edits: SaveEdit[];
	companionEdits: CompanionEdit[];
	companionCatalog: CompanionCatalog;
	busy: boolean;
	error: string;
	nameOf: (itemKey: number) => string;
	onStageSkill: (edit: SkillEdit) => void;
	onDiscardSkill: () => void;
	onStageCompanion: (edit: CompanionEdit) => void;
	onDiscardCompanion: (edit: CompanionEdit) => void;
	onStageLevels: (edits: LevelEdit[]) => void;
	onStageQuests: (edits: QuestStateEdit[]) => void;
	onStageDyes: (edits: DyeEdit[]) => void;
	onStageConditions: (edits: ItemConditionEdit[]) => void;
	onStageNames: (edits: CompanionRenameEdit[]) => void;
}) => {
	switch (view) {
		case "skills":
			return (
				<SkillsPanel
					key="skills"
					description={result.skills}
					edit={edits.find(
						(entry): entry is SkillEdit => entry.type === "skills",
					)}
					busy={busy}
					error={error}
					onStage={onStageSkill}
					onDiscard={onDiscardSkill}
				/>
			);
		case "levels":
			return (
				<LevelsPanel
					key="levels"
					description={result.levels}
					edits={edits.filter(
						(entry): entry is LevelEdit =>
							entry.type === "character" || entry.type === "characterPreset",
					)}
					busy={busy}
					error={error}
					onStage={onStageLevels}
				/>
			);
		case "quests":
			return (
				<QuestsPanel
					key="quests"
					session={session}
					edits={edits.filter(
						(entry): entry is QuestStateEdit =>
							entry.type === "quest" || entry.type === "questPreset",
					)}
					busy={busy}
					error={error}
					onStage={onStageQuests}
				/>
			);
		case "dyes":
			return (
				<DyesPanel
					key="dyes"
					description={result.dyes}
					edits={edits.filter(
						(entry): entry is DyeEdit => entry.type === "dye",
					)}
					busy={busy}
					error={error}
					onStage={onStageDyes}
				/>
			);
		case "condition":
			return (
				<ConditionPanel
					key="condition"
					description={result.conditions}
					nameOf={nameOf}
					edits={edits.filter(
						(entry): entry is ItemConditionEdit => entry.type === "condition",
					)}
					busy={busy}
					error={error}
					onStage={onStageConditions}
				/>
			);
		case "names":
			return (
				<NamesPanel
					key="names"
					description={result.names}
					edits={edits.filter(
						(entry): entry is CompanionRenameEdit =>
							entry.type === "renameCompanion",
					)}
					busy={busy}
					error={error}
					onStage={onStageNames}
				/>
			);
		case "inventory":
			return null;
		default:
			return (
				<CompanionPanel
					key={view}
					category={view}
					summary={result.companions}
					catalog={companionCatalog}
					edits={companionEdits}
					busy={busy}
					error={error}
					onStage={onStageCompanion}
					onDiscard={onDiscardCompanion}
				/>
			);
	}
};
