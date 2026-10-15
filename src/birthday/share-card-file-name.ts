export const shareCardFileName = (name: string): string => {
	const folded = name
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");
	return folded.length > 0
		? `birthday-card-${folded}.png`
		: "birthday-card.png";
};
