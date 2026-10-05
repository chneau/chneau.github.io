import type { RefObject } from "react";

/**
 * The hidden file input the "Open save" buttons click.
 *
 * Its own component so the `accept`, the accessible name and the clip styles
 * are stated once with the element that carries them, rather than as six
 * properties on the shell's layout. The ref stays with the shell because the
 * landing view and the header both press it.
 */
export const SaveFileInput = ({
	inputRef,
	onRequestFile,
}: {
	inputRef: RefObject<HTMLInputElement | null>;
	onRequestFile: (file: File) => void;
}) => (
	<input
		ref={inputRef}
		type="file"
		accept=".save"
		aria-label="Open a Crimson Desert save file"
		style={{
			position: "absolute",
			width: 1,
			height: 1,
			overflow: "hidden",
			clip: "rect(0 0 0 0)",
			whiteSpace: "nowrap",
		}}
		onChange={(event) => {
			const file = event.target.files?.[0];
			// Clear the input so choosing the same file again still fires.
			event.target.value = "";
			if (file) onRequestFile(file);
		}}
	/>
);
