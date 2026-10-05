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
		// react-doctor-disable-next-line react-doctor/server-fetch-without-revalidate -- Provable false positive, and the rule's own premise does not hold here. It fires because "fetch(url) is cached forever by default", which is Next.js App Router's *server-side* fetch cache. This project is not Next.js: `rsbuild.config.ts` declares one static environment per app with `source.entry`, there is no `next` dependency in `package.json` (the only matches for "next" are `i18next` and `react-i18next`), no `next.config`, and no SSR or prerender output. The suggested fix, `{ next: { revalidate } }`, is a Next.js request-init option; a browser `fetch` ignores it silently, so passing it would look like compliance while changing nothing. There is no framework cache here to revalidate — the app's caching contract is the shared service worker, covered by `shared/tests/sw.test.ts`. The fetch is also same-origin, user-initiated (it runs only when someone presses "Load sample"), and targets a file that is part of this build, so it cannot serve one visitor stale content. Verified by two independent readings of the config and the dependency list before this was recorded rather than worked around.
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
