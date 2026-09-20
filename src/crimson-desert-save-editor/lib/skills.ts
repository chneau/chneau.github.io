/**
 * App-facing model for the skills editor, the way `lib/companions.ts` models
 * the companion roster: labels, the staged-edit shape, and the filtering the
 * panel needs. The engine side lives in `lib/save-engine/browser-skills.ts`.
 */

import type {
	SkillDescription,
	SkillEntry,
	SkillMode,
} from "@/lib/save-engine/browser-skills";
import { defined } from "@/lib/save-engine/defined";
import type { SkillsEdit } from "@/lib/save-engine/edits";
import { MAX_KNOWLEDGE_LEVEL } from "@/lib/save-engine/knowledge-bulk";

/** Level cap the game honours; 99 is the highest meaningful value. */
export const maxKnowledgeLevel = MAX_KNOWLEDGE_LEVEL;

type SkillModeInfo = {
	id: SkillMode;
	label: string;
	/** One-line summary shown on the mode card. */
	blurb: string;
	/** What the mode does and does not touch. */
	detail: string;
};

/**
 * The three modes are the CLI's `skills`, `knowledge` and `stats` commands.
 * `skills` comes first because it is the one that unlocks the skill tree.
 */
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

/**
 * One staged progression change. The engine only reads `mode` and `levels`; the
 * rest is what the panel needs to describe the queued change back to the user.
 */
export type SkillEdit = SkillsEdit & {
	label: string;
	targets: number;
	injected: number;
	patched: number;
	relearned: number;
};

/** The description of a staged change, e.g. "Skill tree: 221 keys · 180 new". */
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

/** Group headings for the entry table. */
export const skillGroupLabels: Record<SkillEntry["group"], string> = {
	skillTree: "Skill tree",
	abilities: "Ability",
};

export type SkillGroupFilter = "all" | SkillEntry["group"];

const isMissing = (entry: SkillEntry): boolean => (entry.currentLevel ?? 0) < 1;

/**
 * The entries the panel should list, in reference order. `missingOnly` narrows
 * the list to what the save has not learned yet.
 */
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

/** How many entries in a group are still unlearned, for the filter labels. */
export const missingSkillCount = (
	description: SkillDescription | undefined,
	group: SkillGroupFilter,
): number => {
	if (!description) return 0;
	return description.entries.filter(
		(entry) => (group === "all" || entry.group === group) && isMissing(entry),
	).length;
};
