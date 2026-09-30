import { type SaveSample, SaveWorkbench } from "../../shared";
import { powerFantasy } from "../lib/format";

/**
 * The committed fixture, fetched from this app's own origin.
 *
 * A same-origin GET of a file that is already part of the build, which is not
 * the "no network" promise being broken: the promise is that the user's save is
 * never uploaded, and nothing here touches the user's save. It is what lets a
 * visitor try the editor before they have a save to hand.
 */
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

/**
 * Power Fantasy save editor.
 *
 * The whole page is the shared workbench plus this game's codec. That is the
 * intended shape for every editor here: the parts that are hard — deriving the
 * key, unwrapping the CBC block, staging changes, proving the rebuild reads
 * back — are written once, and a game contributes its format and nothing else.
 */
export const Home = () => (
	<SaveWorkbench codec={powerFantasy} sample={sample} />
);
