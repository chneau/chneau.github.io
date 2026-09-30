import { SaveWorkbench } from "../../shared";
import { cyberpunk2077 } from "../lib/format";

/**
 * Cyberpunk 2077 save editor.
 *
 * The whole page is the shared workbench plus this game's codec. That is the
 * intended shape for every editor here: the parts that are hard — reading a
 * save, staging changes, rebuilding, proving the rebuild is sound — are written
 * once, and a game contributes its format and nothing else.
 *
 * No sample is bundled. A Cyberpunk save is the user's own progress, several
 * megabytes of it, and there is no fixture committed anywhere to copy one from —
 * so the landing page offers a file picker and the notes explain what is inside
 * one, which is more use than a synthetic save nobody recognises.
 */
export const Home = () => <SaveWorkbench codec={cyberpunk2077} />;
