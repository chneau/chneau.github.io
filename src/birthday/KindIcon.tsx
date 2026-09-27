import { Gem, Mars, Venus } from "lucide-react";
import type { Birthday } from "./birthdays";

type Kind = Birthday["kind"];

const KIND_META = {
	"♂️": { Icon: Mars, labelKey: "app.filters.boys" },
	"♀️": { Icon: Venus, labelKey: "app.filters.girls" },
	"💒": { Icon: Gem, labelKey: "app.filters.weddings" },
} as const satisfies Record<Kind, { Icon: typeof Mars; labelKey: string }>;

export const kindLabelKey = (kind: Kind) => KIND_META[kind].labelKey;

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
