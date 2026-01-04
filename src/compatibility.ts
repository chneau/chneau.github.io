import type { Birthday } from "./birthdays";

export const getCompatibilityScore = (a: Birthday, b: Birthday): number => {
	if (a.name === b.name) return 100;

	const e1 = a.element;
	const e2 = b.element;

	// Same element
	if (e1 === e2) return 80;

	// Complementary elements
	// Fire & Air, Earth & Water
	if (
		(e1 === "fire" && e2 === "air") ||
		(e1 === "air" && e2 === "fire") ||
		(e1 === "earth" && e2 === "water") ||
		(e1 === "water" && e2 === "earth")
	) {
		return 100;
	}

	// Neutral (Fire & Earth, Air & Water)
	if (
		(e1 === "fire" && e2 === "earth") ||
		(e1 === "earth" && e2 === "fire") ||
		(e1 === "air" && e2 === "water") ||
		(e1 === "water" && e2 === "air")
	) {
		return 50;
	}

	// Challenging (everything else)
	return 40;
};
