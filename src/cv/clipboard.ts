/**
 * Copying text on the CV, insecure context included.
 *
 * Its own module rather than a helper beside the sections: a component file
 * that also exports a function is not a Fast Refresh boundary, so editing this
 * — or anything else in `sections.tsx` — reloads the whole page instead of
 * swapping the component. `react-doctor` reports that as
 * `only-export-components`, and the fix is the split, not a suppression.
 *
 * The fallback is the reason this is shared at all: the hero's copy buttons and
 * the palette's "Copy CV link" action must give the same answer. They did not —
 * the palette called `navigator.clipboard` directly, so over plain HTTP the
 * button succeeded via `execCommand` while the palette reported a failure, on
 * the same page.
 */
export const copyToClipboard = async (text: string): Promise<void> => {
	if (navigator.clipboard) {
		await navigator.clipboard.writeText(text);
		return;
	}
	// `navigator.clipboard` is absent outside a secure context, and a CV read
	// over plain HTTP is a supported way to arrive here.
	const area = document.createElement("textarea");
	area.value = text;
	area.setAttribute("readonly", "");
	area.style.position = "fixed";
	area.style.opacity = "0";
	document.body.appendChild(area);
	area.select();
	const ok = document.execCommand("copy");
	document.body.removeChild(area);
	if (!ok) throw new Error("copy-failed");
};
