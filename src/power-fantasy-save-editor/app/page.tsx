import { type SaveSample, SaveWorkbench } from "../../shared";
import { powerFantasy } from "../lib/format";

const SAMPLE_URL = new URL("../saves/PowerFantasySave.es3", import.meta.url)
	.href;

const sample: SaveSample = {
	name: "PowerFantasySave.es3",
	note: "A real save, already cheated — every hero levelled and stocked. Useful for seeing what the editor reads.",
	load: async () => {
		const response = await fetch(SAMPLE_URL);
		if (!response.ok) {
			throw new Error(
				`The bundled sample could not be loaded (${response.status}).`,
			);
		}
		return new Uint8Array(await response.arrayBuffer());
	},
};

export const Home = () => (
	<SaveWorkbench codec={powerFantasy} sample={sample} />
);
