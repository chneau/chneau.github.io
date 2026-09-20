type StackInfo = {
	max_stack?: number;
	legacy_max_stack_hint?: number;
	/**
	 * The Item adds as one Record rather than as a stack, so the drawer fixes its
	 * quantity at one. Not the same question as a Record's `noGearToEdit`.
	 */
	addsAsSingleRecord?: boolean;
};

export const catalogStackSize = (item?: StackInfo): number => {
	return item?.max_stack ?? item?.legacy_max_stack_hint ?? 0;
};

export const isAddableItem = (item: StackInfo): boolean => {
	return Boolean(item.addsAsSingleRecord) || catalogStackSize(item) > 1;
};

export const itemSocketSummary = (
	equipment?: {
		socketCap: number | null;
		unlockedSockets: number;
		socketItems: (number | null)[];
	} | null,
) => {
	if (!equipment || equipment.socketCap === null || equipment.socketCap <= 0) {
		return null;
	}
	return {
		filled: equipment.socketItems.filter(Boolean).length,
		unlocked: equipment.unlockedSockets,
	};
};
