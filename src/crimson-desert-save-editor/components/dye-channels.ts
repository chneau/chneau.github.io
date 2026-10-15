export type DyeChannels = {
	red: number | null;
	green: number | null;
	blue: number | null;
	alpha: number | null;
	grime: number | null;
	colorGroup: number | null;
	material: number | null;
};

export const EMPTY_CHANNELS: DyeChannels = {
	red: null,
	green: null,
	blue: null,
	alpha: null,
	grime: null,
	colorGroup: null,
	material: null,
};
