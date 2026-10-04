type HighlightProps = {
	text: string;
	search: string;
};

export const Highlight = ({ text, search }: HighlightProps) => {
	const term = search.trim();
	if (!term) return <>{text}</>;
	const escapedSearch = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const parts = text.split(new RegExp(`(${escapedSearch})`, "gi"));
	// Keyed on the matched text plus how many matches have been seen, rather than
	// on the split index.
	//
	// An index key is reassigned whenever the list shifts, and the shift here is
	// not hypothetical: typing another letter into the search box re-splits the same
	// string into a different number of parts, so every `<mark>` after the edit point
	// would be handed another key's element. The occurrence counter is stable for a
	// given text/term pair, and it is also what stops two identical matches in one
	// string colliding — something the raw content alone could not promise.
	let seen = 0;
	return (
		<>
			{parts.map((part) =>
				part.toLowerCase() === term.toLowerCase() ? (
					<mark key={`${part}:${seen++}`} className="tk-hl">
						{part}
					</mark>
				) : (
					part
				),
			)}
		</>
	);
};
