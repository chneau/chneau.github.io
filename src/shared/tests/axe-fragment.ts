const AXE_FRAGMENT_RULES = [
	"color-contrast",
	"page-has-heading-one",
	"landmark-one-main",
	"region",
	"html-has-lang",
	"document-title",
	"bypass",
	"meta-viewport",
] as const;

export const axeFragmentOptions = (): {
	rules: Record<string, { enabled: boolean }>;
} => ({
	rules: Object.fromEntries(
		AXE_FRAGMENT_RULES.map((id) => [id, { enabled: false }]),
	),
});
