type SkipLinkProps = {
	targetId?: string;
};

export const SkipLink = ({ targetId = "main" }: SkipLinkProps) => {
	const focusTarget = () => {
		const target = document.getElementById(targetId);
		if (!target) return;
		if (!target.hasAttribute("tabindex")) {
			target.setAttribute("tabindex", "-1");
		}
		target.focus();
	};

	return (
		<a className="app-skip-link" href={`#${targetId}`} onClick={focusTarget}>
			Skip to content
		</a>
	);
};
