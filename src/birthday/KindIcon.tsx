import { KIND_META, type Kind } from "./kind-meta";

export { kindLabelKey } from "./kind-meta";

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
