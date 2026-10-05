import { KIND_META, type Kind } from "./kind-meta";

// Re-exported for the existing importers; the mapping is shared by three
// components that label a kind, so it lives in `kind-meta.ts`.
export { kindLabelKey } from "./kind-meta";

/** Presentation-only replacement for the raw gender/wedding emoji. */
export const KindIcon = ({
	kind,
	size = 14,
	strokeWidth = 1.75,
}: {
	kind: Kind;
	size?: number;
	strokeWidth?: number;
}) => {
	const { Icon } = KIND_META[kind];
	return <Icon size={size} strokeWidth={strokeWidth} aria-hidden="true" />;
};
