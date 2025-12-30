import type { Birthday } from "./birthdays";

export const getCompatibilityScore = (a: Birthday, b: Birthday): number => {
	if (a.name === b.name) return 100;

	const e1 = a.element;
	const e2 = b.element;

	// Same element
	if (e1 === e2) return 80;

	// Complementary elements
	if (
		(e1.includes("Fire") && e2.includes("Air")) ||
		(e1.includes("Air") && e2.includes("Fire")) ||
		(e1.includes("Earth") && e2.includes("Water")) ||
		(e1.includes("Water") && e2.includes("Earth"))
	) {
		return 100;
	}

	// Neutral
	if (
		(e1.includes("Fire") && e2.includes("Earth")) ||
		(e1.includes("Earth") && e2.includes("Fire")) ||
		(e1.includes("Air") && e2.includes("Water")) ||
		(e1.includes("Water") && e2.includes("Air"))
	) {
		return 50;
	}

	// Challenging
	return 40;
};
