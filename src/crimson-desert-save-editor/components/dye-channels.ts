/**
 * The seven channels a dye row can carry, all as raw values from the save.
 *
 * Kept beside the dyeing components rather than inside one of them: a module
 * that holds a type and a constant is not a component, and putting them in the
 * row or the panel makes that file export something it is not.
 */
export type DyeChannels = {
	red: number | null;
	green: number | null;
	blue: number | null;
	alpha: number | null;
	grime: number | null;
	colorGroup: number | null;
	material: number | null;
};

/** The channels of a part nobody has touched yet. */
export const EMPTY_CHANNELS: DyeChannels = {
	red: null,
	green: null,
	blue: null,
	alpha: null,
	grime: null,
	colorGroup: null,
	material: null,
};
