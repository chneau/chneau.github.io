import { SaveWorkbench } from "../../shared";
import { chronicon } from "../lib/format";

const PREFERRED_SAVE_FILES = ["global.dat", "b.char", "player.stash"] as const;

const resolveSaveFile = (files: readonly File[]): File | undefined => {
	for (const name of PREFERRED_SAVE_FILES) {
		const match = files.find(
			(file) => file.name.toLowerCase() === name.toLowerCase(),
		);
		if (match) return match;
	}
	return (
		files.find((file) => /\.(dat|char|stash)$/i.test(file.name)) ?? files[0]
	);
};

export const Home = () => (
	<SaveWorkbench codec={chronicon} resolveFile={resolveSaveFile} />
);
