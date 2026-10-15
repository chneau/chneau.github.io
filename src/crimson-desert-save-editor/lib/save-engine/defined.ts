export const defined = <T>(value: T | undefined, what: string): T => {
	if (value === undefined) {
		throw new Error(`Missing ${what}`);
	}
	return value;
};
