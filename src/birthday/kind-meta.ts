import { Gem, Mars, Venus } from "lucide-react";
import type { Birthday } from "./birthdays";

export type Kind = Birthday["kind"];

/**
 * What a kind is drawn with and what it is called. Three components label a
 * kind without knowing what a kind is (the table's name cell, the countdown,
 * the timeline legend), so the mapping lives here rather than beside the icon.
 */
export const KIND_META = {
	"♂️": { Icon: Mars, labelKey: "app.filters.boys" },
	"♀️": { Icon: Venus, labelKey: "app.filters.girls" },
	"💒": { Icon: Gem, labelKey: "app.filters.weddings" },
} as const satisfies Record<Kind, { Icon: typeof Mars; labelKey: string }>;

/** The filter label for a kind. */
export const kindLabelKey = (kind: Kind) => KIND_META[kind].labelKey;
