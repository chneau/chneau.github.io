export type CompanionCategory = "pets" | "mounts" | "specialMounts" | "camp";
export const companionLabels: Record<CompanionCategory, string> = {
	pets: "Pets",
	mounts: "Horses",
	specialMounts: "Special Mounts",
	camp: "Camp Mercenaries",
};
export type CompanionEdit =
	| {
			type: "addCompanion";
			characterKey: number;
			name: string;
			category: CompanionCategory;
	  }
	| {
			type: "addRoboWorkers";
			quantity: number;
			name: string;
			category: "camp";
	  };
type CompanionRecord = {
	characterKey: number;
	id: string;
	name: string;
	species: string;
	category: CompanionCategory;
	selected: boolean;
	assigned: boolean;
	robot: boolean;
};
export type CompanionSummary = {
	records: CompanionRecord[];
	roboWorkers: number;
	maxRoboWorkers: number;
	remainingWorkers: number;
	availableKeys: number[];
	workersSupported: boolean;
	error: string | null;
};
export type CompanionCatalog = {
	entries: Record<
		string,
		{
			name: string;
			category: CompanionCategory;
			addable: boolean;
			equipmentNote?: string;
			internalName?: string;
			browseGroup?: string;
			ownershipGroup?: string;
		}
	>;
};
export const queuedWorkers = (edits: CompanionEdit[]) => {
	return edits.reduce(
		(n, edit) => n + (edit.type === "addRoboWorkers" ? edit.quantity : 0),
		0,
	);
};
export const remainingWorkers = (existing: number, edits: CompanionEdit[]) => {
	return Math.max(0, 500 - existing - queuedWorkers(edits));
};
export const canQueueWorkers = (
	existing: number,
	edits: CompanionEdit[],
	quantity: number,
) => {
	return (
		Number.isSafeInteger(quantity) &&
		quantity > 0 &&
		quantity <= remainingWorkers(existing, edits)
	);
};

const ownershipGroup = (catalog: CompanionCatalog, key: number) => {
	return catalog.entries[String(key)]?.ownershipGroup ?? `character:${key}`;
};

export const companionStatus = (
	catalog: CompanionCatalog,
	summary: CompanionSummary | undefined,
	edits: CompanionEdit[],
	key: number,
) => {
	const group = ownershipGroup(catalog, key);
	if (
		summary?.records.some(
			(r) => ownershipGroup(catalog, r.characterKey) === group,
		)
	) {
		return "Owned";
	}
	if (
		edits.some(
			(e) =>
				e.type === "addCompanion" &&
				ownershipGroup(catalog, e.characterKey) === group,
		)
	) {
		return "Queued";
	}
	if (
		!catalog.entries[String(key)]?.addable ||
		!summary?.availableKeys.includes(key)
	) {
		return "Unavailable";
	}
	return "Add";
};

export type CompanionBrowseRow = {
	key: number;
	name: string;
	group: string;
	status: string;
	count: number;
	assigned: number;
	selected: boolean;
};
export const companionAddRows = (
	catalog: CompanionCatalog,
	summary: CompanionSummary | undefined,
	edits: CompanionEdit[],
	category: CompanionCategory,
): CompanionBrowseRow[] => {
	const available = new Set(summary?.availableKeys ?? []);
	return Object.entries(catalog.entries).flatMap(([key, entry]) => {
		const characterKey = Number(key);
		if (
			!entry.addable ||
			entry.category !== category ||
			characterKey === 1000006 ||
			!available.has(characterKey)
		) {
			return [];
		}
		return [
			{
				key: characterKey,
				name: entry.name,
				group: entry.browseGroup ?? "Other",
				status: companionStatus(catalog, summary, edits, characterKey),
				count: 1,
				assigned: 0,
				selected: false,
			},
		];
	});
};

export const browseCompanions = (
	rows: CompanionBrowseRow[],
	query: string,
	group: string,
	sort: string,
	availableOnly = false,
) => {
	const search = query.trim().toLocaleLowerCase();
	return rows
		.filter(
			(r) =>
				(group === "all" || r.group === group) &&
				(!availableOnly || r.status === "Add") &&
				`${r.name} ${r.group} ${r.key}`.toLocaleLowerCase().includes(search),
		)
		.sort(
			(a, b) =>
				(sort === "type" ? a.group.localeCompare(b.group) : 0) ||
				(sort === "za"
					? b.name.localeCompare(a.name)
					: a.name.localeCompare(b.name)) ||
				a.key - b.key,
		);
};

export const COMPANION_PAGE_SIZE = 12;
export const companionPage = <T>(rows: T[], requestedPage: number) => {
	const pages = Math.max(1, Math.ceil(rows.length / COMPANION_PAGE_SIZE));
	const page = Math.max(0, Math.min(requestedPage, pages - 1));
	return {
		page,
		pages,
		rows: rows.slice(
			page * COMPANION_PAGE_SIZE,
			(page + 1) * COMPANION_PAGE_SIZE,
		),
	};
};
