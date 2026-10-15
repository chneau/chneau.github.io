import { Gem, Mars, Venus } from "lucide-react";
import type { Birthday } from "./birthdays";

export type Kind = Birthday["kind"];

export const KIND_META = {
	"♂️": { Icon: Mars, labelKey: "app.filters.boys" },
	"♀️": { Icon: Venus, labelKey: "app.filters.girls" },
	"💒": { Icon: Gem, labelKey: "app.filters.weddings" },
} as const satisfies Record<Kind, { Icon: typeof Mars; labelKey: string }>;

export const kindLabelKey = (kind: Kind) => KIND_META[kind].labelKey;
