type HighlightProps = {
	text: string;
	search: string;
};

export const Highlight = ({ text, search }: HighlightProps) => {
	const term = search.trim();
	if (!term) return <>{text}</>;
	const escapedSearch = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const parts = text.split(new RegExp(`(${escapedSearch})`, "gi"));
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
