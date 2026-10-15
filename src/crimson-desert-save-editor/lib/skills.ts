import type {
	SkillDescription,
	SkillEntry,
	SkillMode,
} from "./save-engine/browser-skills";
import { defined } from "./save-engine/defined";
import type { SkillsEdit } from "./save-engine/edits";
import { MAX_KNOWLEDGE_LEVEL } from "./save-engine/knowledge-bulk";

export const maxKnowledgeLevel = MAX_KNOWLEDGE_LEVEL;

type SkillModeInfo = {
	id: SkillMode;
	label: string;
	blurb: string;
	detail: string;
};

export const skillModes: SkillModeInfo[] = [
	{
		id: "skills",
		label: "Skill tree",
		blurb: "Unlock every skill to its reference level",
		detail:
			"Injects the knowledge entries the skill tree is built from — the 83 skill-list keys plus the 138 Elemental, life-skill and mount abilities — at the levels a 100% save has. Unrelated knowledge is left alone.",
	},
	{
		id: "knowledge",
		label: "All knowledge",
		blurb: "Learn everything and mirror the reference",
		detail:
			"Adds every missing knowledge entry and re-levels everything already learned, including the entries the skill tree never uses. Use this when you want the whole knowledge log filled in.",
	},
	{
		id: "stats",
		label: "Health · stamina · spirit",
		blurb: "Set the three stats to their true caps",
		detail:
			"Sets the nine stat keys 1005839–1005847 to spirit 12, stamina 14 and health 18. Level 99 is not valid — the game clamps it, which is why it looked maxed without the real stats moving.",
	},
];

export const modeInfo = (id: SkillMode): SkillModeInfo =>
	defined(
		skillModes.find((mode) => mode.id === id) ?? skillModes[0],
		"skill mode",
	);

export type SkillEdit = SkillsEdit & {
	label: string;
	targets: number;
	injected: number;
	patched: number;
	relearned: number;
};

export const skillEditSummary = (edit: SkillEdit): string => {
	const parts = [`${edit.targets.toLocaleString()} keys`];
	if (edit.injected) parts.push(`${edit.injected.toLocaleString()} new`);
	if (edit.patched) parts.push(`${edit.patched.toLocaleString()} re-levelled`);
	if (edit.relearned) {
		parts.push(`${edit.relearned.toLocaleString()} re-learned`);
	}
	if (edit.levels?.length) {
		parts.push(
			`${edit.levels.length} override${edit.levels.length === 1 ? "" : "s"}`,
		);
	}
	return parts.join(" · ");
};

export const skillGroupLabels: Record<SkillEntry["group"], string> = {
	skillTree: "Skill tree",
	abilities: "Ability",
};

export type SkillGroupFilter = "all" | SkillEntry["group"];

const isMissing = (entry: SkillEntry): boolean => (entry.currentLevel ?? 0) < 1;

export const filterSkillEntries = (
	description: SkillDescription | undefined,
	query: string,
	group: SkillGroupFilter,
	missingOnly: boolean,
): SkillEntry[] => {
	if (!description) return [];
	const search = query.trim().toLocaleLowerCase();
	return description.entries.filter(
		(entry) =>
			(group === "all" || entry.group === group) &&
			(!missingOnly || isMissing(entry)) &&
			`${entry.name} ${entry.key}`.toLocaleLowerCase().includes(search),
	);
};

export const missingSkillCount = (
	description: SkillDescription | undefined,
	group: SkillGroupFilter,
): number => {
	if (!description) return 0;
	return description.entries.filter(
		(entry) => (group === "all" || entry.group === group) && isMissing(entry),
	).length;
};
