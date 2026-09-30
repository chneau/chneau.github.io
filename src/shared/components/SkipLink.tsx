type SkipLinkProps = {
	/** id of the page's main landmark. */
	targetId?: string;
};

/** Keyboard-only "skip to content" link, visually hidden until focused. */
export const SkipLink = ({ targetId = "main" }: SkipLinkProps) => {
	const focusTarget = () => {
		const target = document.getElementById(targetId);
		if (!target) return;
		// A fragment link only scrolls; the target must be focusable for focus
		// to actually move. Set tabindex="-1" when the app has not already.
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
