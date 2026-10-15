type Rgb = readonly [number, number, number];

export type Rgba = readonly [number, number, number, number];

export const parseColor = (input: string): Rgba | undefined => {
	const value = input.trim().toLowerCase();
	if (value === "" || value === "transparent") return [0, 0, 0, 0];
	if (value === "currentcolor" || value === "none") return undefined;

	const hex = /^#([0-9a-f]{3,8})$/.exec(value);
	if (hex) {
		const digits = hex[1] ?? "";
		const pair = (index: number) =>
			parseInt(
				digits.length <= 4
					? (digits[index] ?? "0").repeat(2)
					: digits.slice(index * 2, index * 2 + 2),
				16,
			);
		if (digits.length === 3 || digits.length === 4) {
			return [
				pair(0),
				pair(1),
				pair(2),
				digits.length === 4 ? pair(3) / 255 : 1,
			];
		}
		if (digits.length === 6 || digits.length === 8) {
			return [
				pair(0),
				pair(1),
				pair(2),
				digits.length === 8 ? pair(3) / 255 : 1,
			];
		}
		return undefined;
	}

	const fn = /^(rgba?|color)\(([^)]*)\)$/.exec(value);
	if (!fn) return undefined;
	const parts = (fn[2] ?? "")
		.split(/[,/\s]+/)
		.map((part) => part.trim())
		.filter(Boolean);

	const scale = fn[1] === "color" ? 255 : 1;
	const channel = (raw: string | undefined) => {
		if (raw === undefined) return 0;
		return raw.endsWith("%")
			? (Number.parseFloat(raw) / 100) * 255
			: Number.parseFloat(raw) * scale;
	};
	const alpha = (raw: string | undefined) => {
		if (raw === undefined) return 1;
		return raw.endsWith("%")
			? Number.parseFloat(raw) / 100
			: Number.parseFloat(raw);
	};

	if (fn[1] === "color") {
		return [
			channel(parts[0]),
			channel(parts[1]),
			channel(parts[2]),
			alpha(parts[3]),
		];
	}
	return [
		channel(parts[0]),
		channel(parts[1]),
		channel(parts[2]),
		alpha(parts[3]),
	];
};

export const composite = (top: Rgba, bottom: Rgba): Rgba => {
	const alpha = top[3] + bottom[3] * (1 - top[3]);
	if (alpha === 0) return [0, 0, 0, 0];
	return [
		(top[0] * top[3] + bottom[0] * bottom[3] * (1 - top[3])) / alpha,
		(top[1] * top[3] + bottom[1] * bottom[3] * (1 - top[3])) / alpha,
		(top[2] * top[3] + bottom[2] * bottom[3] * (1 - top[3])) / alpha,
		alpha,
	];
};

const luminance = (colour: Rgb): number => {
	const [r, g, b] = colour.map((channel) => {
		const c = channel / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	}) as [number, number, number];
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const ratio = (a: Rgba, b: Rgba): number => {
	const l1 = luminance([a[0], a[1], a[2]]);
	const l2 = luminance([b[0], b[1], b[2]]);
	return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

export const contrastRatio = (a: string, b: string): number => {
	const first = parseColor(a);
	const second = parseColor(b);
	if (!first || !second) {
		throw new Error(`not a colour: ${!first ? a : b}`);
	}
	return ratio(first, second);
};
