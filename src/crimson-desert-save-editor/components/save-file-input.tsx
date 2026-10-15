import type { RefObject } from "react";

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
			event.target.value = "";
			if (file) onRequestFile(file);
		}}
	/>
);
