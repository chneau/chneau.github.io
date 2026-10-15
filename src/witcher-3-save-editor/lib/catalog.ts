import names from "./generated/names.json";

const QUEST_TITLES: Readonly<Record<string, string>> = names.quests;

const STRINGS: Readonly<Record<string, string>> = names.strings;

export const questTitle = (questId: string): string | undefined => {
	const direct = Object.hasOwn(QUEST_TITLES, questId)
		? QUEST_TITLES[questId]
		: undefined;
	if (direct !== undefined) return direct;
	const wanted = questId.toLowerCase();
	for (const [id, title] of Object.entries(QUEST_TITLES)) {
		if (id.toLowerCase() === wanted) return title;
	}
	return undefined;
};

export const localizedString = (key: string): string | undefined =>
	Object.hasOwn(STRINGS, key) ? STRINGS[key] : undefined;
