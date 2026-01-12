interface HighlightProps {
	text: string;
	search: string;
}

export const Highlight = ({ text, search }: HighlightProps) => {
	const term = search.trim();
	if (!term) return <>{text}</>;
	const escapedSearch = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const parts = text.split(new RegExp(`(${escapedSearch})`, "gi"));
	return (
		<>
			{parts.map((part, i) =>
				part.toLowerCase() === term.toLowerCase() ? (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: fine for static text parts
						key={i}
						style={{ backgroundColor: "#ffe58f", padding: 0, color: "black" }}
					>
						{part}
					</span>
				) : (
					part
				),
			)}
		</>
	);
};
