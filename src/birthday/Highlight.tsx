type HighlightProps = {
	text: string;
	search: string;
};

export const Highlight = ({ text, search }: HighlightProps) => {
	const term = search.trim();
	if (!term) return <>{text}</>;
	const escapedSearch = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const parts = text.split(new RegExp(`(${escapedSearch})`, "gi"));
	return (
		<>
			{parts.map((part, i) =>
				part.toLowerCase() === term.toLowerCase() ? (
					<mark key={i} className="tk-hl">
						{part}
					</mark>
				) : (
					part
				),
			)}
		</>
	);
};
