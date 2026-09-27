type SkipLinkProps = {
	/** id of the page's main landmark. */
	targetId?: string;
};

/** Keyboard-only "skip to content" link, visually hidden until focused. */
export const SkipLink = ({ targetId = "main" }: SkipLinkProps) => (
	<a className="app-skip-link" href={`#${targetId}`}>
		Skip to content
	</a>
);
