/**
 * A safe filename for the `download` attribute.
 *
 * The display name is free text: it may hold spaces, accents, `&`, `/` or
 * parentheses, and browsers treat a `/` in a download name inconsistently at
 * best and as a path at worst. Diacritics are folded with NFD (so `Cécile`
 * becomes `Cecile` rather than losing its `e`), and everything outside
 * `[a-z0-9]` is dropped.
 */
export const shareCardFileName = (name: string): string => {
	const folded = name
		.normalize("NFD")
		// Combining marks left behind by the decomposition above.
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");
	// A name of only accents/punctuation/symbols would otherwise yield an
	// empty stem.
	return folded.length > 0
		? `birthday-card-${folded}.png`
		: "birthday-card.png";
};
